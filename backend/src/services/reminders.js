const { supabaseAdmin } = require('../config/supabase');
const sessionManager = require('../whatsapp/sessionManager');

const BATCH_LIMIT = 50;

/** Baja los bytes de un adjunto (imagen) desde su URL pública de Supabase Storage. */
async function downloadAttachment(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el adjunto (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Arma la lista de contenidos que espera sock.sendMessage() de Baileys a
 * partir de un recordatorio. Con varias imágenes, el mensaje va como
 * "caption" de la primera nada más — repetirlo en cada una saturaría el
 * chat — el resto se manda sin caption. Esta función no sabe nada de cómo
 * se agrupan realmente al enviarse (eso es un detalle de protocolo de
 * WhatsApp) — sessionManager.enqueueMessage()/processQueue() encola esta
 * lista completa como una sola unidad y decide ahí si arma un álbum real.
 */
async function buildOutgoingContents(reminder, mensaje) {
  const urls = reminder.imagenes_urls || [];
  if (urls.length === 0) return [{ text: mensaje }];

  const images = await Promise.all(urls.map(downloadAttachment));
  return images.map((image, i) => ({ image, caption: i === 0 ? mensaje.trim() || undefined : undefined }));
}

async function markReminder(id, estado, error = null) {
  await supabaseAdmin
    .from('recordatorios')
    .update({ estado, error })
    .eq('id', id);
}

/**
 * Si `diasPermitidos` restringe la repetición a ciertos días de la semana
 * (0 = domingo … 6 = sábado, `Date.getDay()`), empuja `date` día por día
 * (conservando la hora) hasta caer en uno permitido. `null`/vacío significa
 * "sin restricción" — no toca la fecha, mismo comportamiento que antes de
 * que existiera esta opción. El tope de 7 intentos es solo una guarda
 * defensiva (un arreglo vacío por error de datos no debería colgar esto en
 * un bucle infinito) — con al menos un día permitido, siempre se resuelve
 * en 6 pasos o menos.
 */
function ajustarADiaPermitido(date, diasPermitidos) {
  if (!diasPermitidos || diasPermitidos.length === 0) return date;
  const ajustada = new Date(date);
  let intentos = 0;
  while (!diasPermitidos.includes(ajustada.getDay()) && intentos < 7) {
    ajustada.setDate(ajustada.getDate() + 1);
    intentos++;
  }
  return ajustada;
}

/**
 * Calcula la siguiente fecha_envio de un recordatorio recurrente a partir de
 * la fecha en que "tocaba" enviarse (no de "ahora"), para que la cadencia no
 * se recorra si el cron tardó en procesarlo. Nota: en frecuencia 'mensual',
 * Date.setMonth() puede desbordar meses cortos (31 ene + 1 mes -> 3 mar en
 * vez de 28/29 feb); es una limitación conocida de la aritmética de fechas
 * de JS, no un bug de este cálculo.
 */
function computeNextFechaEnvio(fechaEnvioAnterior, frecuencia, intervaloDias, diasPermitidos) {
  const next = new Date(fechaEnvioAnterior);
  switch (frecuencia) {
    case 'diaria':
      next.setDate(next.getDate() + 1);
      break;
    case 'semanal':
      next.setDate(next.getDate() + 7);
      break;
    case 'mensual':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'personalizada':
      next.setDate(next.getDate() + (intervaloDias || 1));
      break;
  }
  return ajustarADiaPermitido(next, diasPermitidos);
}

// Mismo umbral que MIN_GAP_MS en el frontend (useRecordatorios.ts): dos
// recordatorios propios a menos de 1 minuto se sentirían como una ráfaga de
// bot para WhatsApp si le tocaran salir casi al mismo tiempo. El formulario
// ya avisa de esto al crear uno, pero una reprogramación automática de un
// recurrente (más abajo) no vuelve a pasar por ese aviso — puede terminar
// coincidiendo con otro recordatorio sin que nadie lo note.
const MIN_GAP_MS = 60_000;

// Tolerancia máxima de retraso al momento de enviar: si el cron recoge un
// recordatorio cuando ya pasó demasiado tiempo desde su fecha_envio (ej. el
// proceso estuvo caído, o se acumuló la cola por otro motivo), ya no tiene
// caso mandarlo fuera de horario — se descarta ese envío en vez de llegar
// tarde, y queda el motivo registrado en vez de simplemente no salir.
const MAX_ATRASO_ENVIO_MS = 5 * 60 * 1000;
const MOTIVO_FUERA_DE_TOLERANCIA =
  'No enviado: se excedió la tolerancia de 5 minutos de retraso respecto a la hora programada';

/**
 * Si `candidate` cae a menos de MIN_GAP_MS de otro recordatorio activo
 * (pendiente/en_proceso) del mismo usuario, lo empuja justo después de ese
 * conflicto. Repite unas pocas veces por si el nuevo horario choca con
 * otro más (encadenar varios recordatorios muy juntos es posible, aunque
 * raro). No es una barrera de seguridad — la cola anti-ban del backend ya
 * espacia los envíos reales sin importar qué tan juntos estén programados
 * (sessionManager.js) — es solo para que la fecha que se ve en el
 * calendario no quede pisando la de otro recordatorio sin querer.
 */
async function evitarChoqueDeHorario(userId, idAExcluir, candidate) {
  let siguiente = candidate;
  for (let intento = 0; intento < 5; intento++) {
    const desde = new Date(siguiente.getTime() - MIN_GAP_MS).toISOString();
    const hasta = new Date(siguiente.getTime() + MIN_GAP_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from('recordatorios')
      .select('fecha_envio')
      .eq('user_id', userId)
      .neq('id', idAExcluir)
      .in('estado', ['pendiente', 'en_proceso'])
      .gte('fecha_envio', desde)
      .lte('fecha_envio', hasta)
      .limit(1);

    if (error) {
      console.error(`[reminders] no se pudo revisar choques de horario (${userId}):`, error.message);
      return siguiente;
    }
    if (!data || data.length === 0) return siguiente;

    siguiente = new Date(new Date(data[0].fecha_envio).getTime() + MIN_GAP_MS + 1000);
  }
  return siguiente;
}

/**
 * Deja un registro histórico permanente de UNA ocurrencia de un recordatorio
 * recurrente que ya se resolvió (enviada o fallida) — sin esto, reprogramar
 * la misma fila hacia adelante borra cualquier rastro de que ese envío
 * pasó: la fila ya no muestra esa fecha en ningún lado (ni en "Logs", que
 * solo filtra `estado IN (enviado, fallido)`, ni en el calendario del día en
 * que realmente se envió). Se copian los datos de frecuencia/fecha_fin/días
 * permitidos tal cual para que la tarjeta siga mostrando el badge "🔁
 * frecuencia" con contexto — no importa que "sea recurrente" en la copia,
 * porque su `estado` ya es terminal (enviado/fallido) y el cron solo mira
 * filas en `pendiente`, así que esta copia nunca se vuelve a procesar.
 */
async function crearRegistroHistorico(reminder, estado, errorMessage, ultimoEnvio) {
  const { error } = await supabaseAdmin.from('recordatorios').insert({
    user_id: reminder.user_id,
    cliente_id: reminder.cliente_id,
    mensaje_plantilla: reminder.mensaje_plantilla,
    fecha_envio: reminder.fecha_envio,
    estado,
    error: errorMessage,
    es_recurrente: true,
    frecuencia: reminder.frecuencia,
    intervalo_dias: reminder.intervalo_dias,
    fecha_fin: reminder.fecha_fin,
    dias_permitidos: reminder.dias_permitidos,
    imagenes_urls: reminder.imagenes_urls,
    ultimo_envio: ultimoEnvio,
  });
  if (error) {
    console.error(`[reminders] no se pudo crear el registro histórico de ${reminder.id}:`, error.message);
  }
}

/**
 * Tras un envío exitoso: si el recordatorio es recurrente y no ha llegado a
 * su fecha_fin (si tiene una), lo reprograma en la misma fila (vuelve a
 * 'pendiente' con la siguiente fecha_envio) en vez de dejarlo en 'enviado'.
 * Si sigue activa (no terminó la serie), esta ocurrencia se guarda aparte
 * vía crearRegistroHistorico() antes de mover la fila — si terminó, la
 * fila misma se queda en 'enviado' con esta fecha y ya es su propio
 * registro, sin necesidad de duplicar nada.
 */
async function markEnviadoYReprogramar(reminder) {
  const ahora = new Date().toISOString();

  if (!reminder.es_recurrente) {
    await markReminder(reminder.id, 'enviado');
    return;
  }

  let siguiente = computeNextFechaEnvio(
    reminder.fecha_envio,
    reminder.frecuencia,
    reminder.intervalo_dias,
    reminder.dias_permitidos
  );
  const terminado = reminder.fecha_fin && siguiente > new Date(reminder.fecha_fin);
  if (!terminado) {
    siguiente = await evitarChoqueDeHorario(reminder.user_id, reminder.id, siguiente);
    await crearRegistroHistorico(reminder, 'enviado', null, ahora);
  }

  await supabaseAdmin
    .from('recordatorios')
    .update({
      estado: terminado ? 'enviado' : 'pendiente',
      fecha_envio: terminado ? reminder.fecha_envio : siguiente.toISOString(),
      ultimo_envio: ahora,
      error: null,
    })
    .eq('id', reminder.id);
}

/**
 * Tras un envío fallido de un recordatorio RECURRENTE: a diferencia de uno
 * único, no se deja en 'fallido' para siempre — eso mataría la serie
 * completa por un solo intento fallido (ej. WhatsApp no confirmó a tiempo
 * esa vez). Se reprograma igual al siguiente ciclo (guardando esta
 * ocurrencia en un registro histórico aparte, igual que en
 * markEnviadoYReprogramar), con el error visible en la fila viva hasta el
 * próximo envío exitoso (que lo limpia en markEnviadoYReprogramar), para
 * que quede un rastro de que algo falló sin detener los envíos futuros.
 */
async function markFallidoRecurrenteYReprogramar(reminder, errorMessage) {
  let siguiente = computeNextFechaEnvio(
    reminder.fecha_envio,
    reminder.frecuencia,
    reminder.intervalo_dias,
    reminder.dias_permitidos
  );
  const terminado = reminder.fecha_fin && siguiente > new Date(reminder.fecha_fin);
  if (!terminado) {
    siguiente = await evitarChoqueDeHorario(reminder.user_id, reminder.id, siguiente);
    await crearRegistroHistorico(reminder, 'fallido', errorMessage, new Date().toISOString());
  }

  await supabaseAdmin
    .from('recordatorios')
    .update({
      estado: terminado ? 'fallido' : 'pendiente',
      fecha_envio: terminado ? reminder.fecha_envio : siguiente.toISOString(),
      error: errorMessage,
    })
    .eq('id', reminder.id);
}

/**
 * Intenta enviar un recordatorio YA CONFIRMADO como listo (WhatsApp
 * conectado, no se valida atraso aquí) y deja la fila en el estado que
 * corresponda — compartido entre `processPendingReminders()` (el cron) y
 * `sendReminderNow()` (el botón "Enviar ahora"), para no duplicar la lógica
 * de resolver teléfono/JID, preparar adjuntos y reprogramar según el
 * resultado.
 */
async function intentarEnviarRecordatorio(reminder) {
  const telefono = reminder.clientes?.telefono;
  const nombre = reminder.clientes?.nombre ?? '';

  if (!telefono) {
    await markReminder(reminder.id, 'fallido', 'Cliente sin teléfono');
    return;
  }

  // Un grupo ya trae su JID válido (@g.us) desde que se importó de
  // WhatsApp — no tiene sentido validarlo con onWhatsApp(), que es para
  // números individuales.
  const jid = reminder.clientes?.es_grupo ? telefono : await sessionManager.resolveJid(reminder.user_id, telefono);
  if (!jid) {
    await markReminder(reminder.id, 'fallido', 'El número no tiene WhatsApp o el formato es incorrecto');
    return;
  }

  const mensaje = reminder.mensaje_plantilla.replace(/\{\{\s*nombre\s*\}\}/g, nombre);

  let contents;
  try {
    contents = await buildOutgoingContents(reminder, mensaje);
  } catch (err) {
    console.error(`[reminders] no se pudo preparar el adjunto de ${reminder.id}:`, err.message);
    if (reminder.es_recurrente) {
      await markFallidoRecurrenteYReprogramar(reminder, err.message);
    } else {
      await markReminder(reminder.id, 'fallido', err.message);
    }
    return;
  }

  sessionManager.enqueueMessage(reminder.user_id, jid, contents, async (err) => {
    if (err) {
      console.error(`[reminders] fallo al enviar ${reminder.id}:`, err.message);
      if (reminder.es_recurrente) {
        await markFallidoRecurrenteYReprogramar(reminder, err.message);
      } else {
        await markReminder(reminder.id, 'fallido', err.message);
      }
      return;
    }

    await markEnviadoYReprogramar(reminder);
  });
}

// Si dos disparadores del cron (ej. el setInterval interno y una llamada
// externa de cron-job.org) se superponen en el tiempo, ambos podían
// consultar los mismos recordatorios 'pendiente' ANTES de que el primero
// alcanzara a marcarlos 'en_proceso' — y ambos terminaban mandando el mismo
// mensaje por separado (doble envío real a WhatsApp, no solo un dato
// duplicado). Este candado en memoria hace que una corrida ya en curso
// bloquee cualquier otra hasta terminar, sin importar quién la disparó.
let procesando = false;

/**
 * Busca recordatorios pendientes cuya fecha_envio ya pasó y los reparte por
 * el número de WhatsApp de CADA usuario: cada quien envía desde su propia
 * sesión, no desde un número compartido. Un recordatorio cuyo dueño todavía
 * no tiene su WhatsApp conectado se deja en 'pendiente' (no se marca como
 * fallido) para reintentarlo en la siguiente corrida.
 */
async function processPendingReminders() {
  if (procesando) {
    return { processed: 0, reason: 'ya_en_proceso' };
  }
  procesando = true;
  try {
    return await processPendingRemindersInterno();
  } finally {
    procesando = false;
  }
}

/**
 * Reanuda solos los recordatorios cuya pausa con duración ya venció
 * (`pausado_hasta` en el pasado) — la pausa "indefinida" (`pausado_hasta`
 * nulo) nunca entra aquí, solo se reanuda a mano o al reconectar WhatsApp
 * (sessionManager.js). No reprograma nada por su cuenta: si el
 * `fecha_envio` que tenía quedó en el pasado durante la pausa, el resto de
 * `processPendingRemindersInterno()` ya sabe qué hacer con eso (la
 * tolerancia de 5 minutos lo manda a la siguiente ocurrencia en vez de
 * enviarlo tarde) — es el mismo camino que sigue cualquier otro
 * recordatorio atrasado, sin lógica especial para este caso.
 */
async function resumeExpiredPauses() {
  const { error } = await supabaseAdmin
    .from('recordatorios')
    .update({ estado: 'pendiente', pausado_hasta: null })
    .eq('estado', 'pausado')
    .not('pausado_hasta', 'is', null)
    .lte('pausado_hasta', new Date().toISOString());
  if (error) console.error('[reminders] no se pudieron reanudar pausas vencidas:', error.message);
}

async function processPendingRemindersInterno() {
  await resumeExpiredPauses();

  // Los recordatorios de usuarios desactivados por un admin quedan en pausa:
  // no se procesan (ni se marcan como fallidos) hasta que se reactive la cuenta.
  const { data: inactivos, error: inactivosError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('activo', false);
  if (inactivosError) throw inactivosError;
  const idsInactivos = (inactivos || []).map((p) => p.id);

  const nowIso = new Date().toISOString();
  let query = supabaseAdmin
    .from('recordatorios')
    .select(
      'id, user_id, mensaje_plantilla, cliente_id, fecha_envio, es_recurrente, frecuencia, intervalo_dias, fecha_fin, dias_permitidos, imagenes_urls, clientes(nombre, telefono, es_grupo)'
    )
    .eq('estado', 'pendiente')
    .lte('fecha_envio', nowIso)
    .limit(BATCH_LIMIT);

  if (idsInactivos.length > 0) {
    query = query.not('user_id', 'in', `(${idsInactivos.join(',')})`);
  }

  const { data: reminders, error } = await query;

  if (error) throw error;
  if (reminders.length === 0) return { processed: 0 };

  // Solo se toman los que su dueño tiene WhatsApp conectado ahora mismo;
  // el resto se deja intacto en 'pendiente' para el siguiente ciclo.
  const listos = reminders.filter((r) => sessionManager.getStatus(r.user_id) === 'connected');
  if (listos.length === 0) return { processed: 0, reason: 'sin_sesiones_conectadas' };

  const ids = listos.map((r) => r.id);
  await supabaseAdmin.from('recordatorios').update({ estado: 'en_proceso' }).in('id', ids);

  for (const reminder of listos) {
    const atrasoMs = Date.now() - new Date(reminder.fecha_envio).getTime();
    if (atrasoMs > MAX_ATRASO_ENVIO_MS) {
      if (reminder.es_recurrente) {
        await markFallidoRecurrenteYReprogramar(reminder, MOTIVO_FUERA_DE_TOLERANCIA);
      } else {
        await markReminder(reminder.id, 'fallido', MOTIVO_FUERA_DE_TOLERANCIA);
      }
      continue;
    }

    await intentarEnviarRecordatorio(reminder);
  }

  return { processed: listos.length };
}

/**
 * "Enviar ahora": el usuario decide mandar un recordatorio pendiente en
 * este instante en vez de esperar a su fecha_envio programada. Reusa
 * exactamente la misma `intentarEnviarRecordatorio()`/`markEnviadoYReprogramar()`
 * que usa el cron para un envío normal — la diferencia es solo CUÁNDO se
 * dispara, no qué pasa después: si es recurrente, `markEnviadoYReprogramar()`
 * calcula el siguiente ciclo a partir de `reminder.fecha_envio` (la fecha que
 * tenía programada, no "ahora"), así que la siguiente ocurrencia programada
 * queda saltada — es justo el efecto de "ya se mandó en este momento, no lo
 * repitas en la fecha que tenía" que se pidió. A diferencia del cron, aquí
 * NO se aplica la tolerancia de 5 minutos (MAX_ATRASO_ENVIO_MS) — es una
 * acción explícita del usuario, no un envío automático fuera de horario.
 */
async function sendReminderNow(userId, reminderId) {
  const { data: reminder, error } = await supabaseAdmin
    .from('recordatorios')
    .select(
      'id, user_id, mensaje_plantilla, cliente_id, fecha_envio, estado, es_recurrente, frecuencia, intervalo_dias, fecha_fin, dias_permitidos, imagenes_urls, clientes(nombre, telefono, es_grupo)'
    )
    .eq('id', reminderId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!reminder) throw new Error('Recordatorio no encontrado');
  if (reminder.estado !== 'pendiente') {
    throw new Error('Solo se puede enviar ahora un recordatorio pendiente');
  }
  if (sessionManager.getStatus(userId) !== 'connected') {
    throw new Error('Tu WhatsApp no está conectado');
  }

  await markReminder(reminder.id, 'en_proceso');
  await intentarEnviarRecordatorio(reminder);
}

module.exports = { processPendingReminders, sendReminderNow };
