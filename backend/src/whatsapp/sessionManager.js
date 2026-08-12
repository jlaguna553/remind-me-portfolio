const { loadBaileys } = require('./loadBaileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const pino = require('pino');
const { useSupabaseAuthState } = require('./supabaseAuthState');
const { supabaseAdmin } = require('../config/supabase');

const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60_000;
// Si una sesión lleva más de esto en 'connecting' sin pasar a 'qr'/'connected',
// se considera trabada (ej. la sesión de red al pedir la versión de Baileys
// colgó) y se permite reintentar en vez de bloquear connect() para siempre.
const CONNECTING_TIMEOUT_MS = 45_000;

/**
 * Cada usuario tiene su propio número de WhatsApp, así que cada uno vive en
 * su propia entrada de este mapa: su propio socket de Baileys, su propio
 * estado de conexión/QR, y su propia cola anti-ban con su propio delay
 * aleatorio. Esto reemplaza el diseño anterior de una sola sesión global
 * compartida por todos los usuarios.
 *
 * userId -> { sock, status, qr, authHandle, queue: [], processing: boolean }
 */
const sessions = new Map();

function getOrInitEntry(userId) {
  let entry = sessions.get(userId);
  if (!entry) {
    entry = {
      sock: null,
      status: 'disconnected',
      qr: null,
      pairingCode: null,
      authHandle: null,
      queue: [],
      processing: false,
      contacts: new Map(),
    };
    sessions.set(userId, entry);
  }
  return entry;
}

/**
 * Inicia (o reconecta) la sesión de WhatsApp de un usuario específico.
 * No hace nada si ya está conectando o conectado, para no crear sockets
 * duplicados si el usuario refresca la página varias veces — salvo que el
 * 'connecting' lleve trabado más de CONNECTING_TIMEOUT_MS, en cuyo caso se
 * trata como una conexión fallida y se permite reintentar.
 *
 * `internal: true` marca las reconexiones que el propio backend dispara
 * solo (ver el manejador de 'close' más abajo) — WhatsApp reconecta el
 * socket una vez, sola, como paso NORMAL a medio camino de cualquier
 * vinculación (con QR o con código), pase lo que pase después; no es señal
 * de que el intento murió. Esa distinción importa para la limpieza de
 * creds.me de abajo.
 */
async function startSession(userId, { internal = false } = {}) {
  const entry = getOrInitEntry(userId);
  const connectingDemasiado =
    entry.status === 'connecting' && Date.now() - (entry.connectingSince ?? 0) > CONNECTING_TIMEOUT_MS;

  if (entry.status === 'connected' || (entry.status === 'connecting' && !connectingDemasiado)) {
    return entry;
  }

  entry.status = 'connecting';
  entry.connectingSince = Date.now();

  try {
    const { default: makeWASocket, fetchLatestBaileysVersion } = await loadBaileys();
    entry.authHandle = await useSupabaseAuthState(userId);
    const { state, saveCreds } = entry.authHandle;

    // requestPairingCode() (más abajo) setea creds.me tan pronto se pide un
    // código, y lo mismo hace Baileys internamente en cuanto se escanea el
    // QR — en ambos casos, ANTES de que el proceso de vinculación termine
    // de verdad (validateConnection() decide mandar un handshake de "iniciar
    // sesión" en vez de "registrar dispositivo nuevo" con solo mirar si
    // creds.me existe, y de hecho DEBE tomar esa rama en la reconexión
    // automática que sigue a un QR/código correcto para completar el
    // proceso — no es un error, es el siguiente paso esperado).
    //
    // El problema real es un creds.me que quedó de un intento REALMENTE
    // abandonado (el usuario nunca terminó de escribir el código, o el
    // backend se reinició a medio proceso) y se guardó en Supabase: un
    // intento posterior heredaría ese creds.me viejo y WhatsApp rechazaría
    // el handshake de "iniciar sesión" porque ese dispositivo nunca llegó a
    // registrarse de verdad. Por eso esta limpieza solo corre cuando
    // `!internal` — es decir, en un arranque genuinamente nuevo (el usuario
    // le dio "Conectar"/"Obtener código" desde 'disconnected', o el proceso
    // acaba de arrancar) — nunca en la reconexión automática que el propio
    // 'close' handler dispara para completar un intento que iba bien. La
    // primera versión de este fix no hacía esta distinción y limpiaba en
    // CADA reconexión, incluyendo la normal — mataba cualquier intento a la
    // mitad, con QR o con código, justo cuando iba a terminar de vincularse.
    if (!internal && !state.creds.registered && state.creds.me) {
      delete state.creds.me;
      delete state.creds.pairingCode;
      await saveCreds();
      entry.pairingCode = null;
    }

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      // printQRInTerminal ya no existe como opción en Baileys 7.x (el QR se
      // maneja igual que antes, vía el evento connection.update más abajo).
      browser: ['Remind-me', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });
    entry.sock = sock;
    attachHandlers(userId, entry, sock, saveCreds);
    return entry;
  } catch (err) {
    // Sin esto, un fallo a medio camino (ej. timeout de red) dejaba el
    // estado en 'connecting' para siempre y bloqueaba cualquier reintento.
    entry.status = 'disconnected';
    entry.sock = null;
    throw err;
  }
}

/**
 * Pausa todos los recordatorios 'pendiente' de un usuario (pasan a
 * 'pausado', sin tocar 'en_proceso'/'enviado'/'fallido'/los ya pausados).
 * Se usa al desvincular el número: mientras no haya WhatsApp conectado no
 * tiene caso que el cron los siga recogiendo. Se marca `pausado_por_desconexion
 * = true` para que resumeUserReminders() sepa que ESTA pausa la causó el
 * propio backend (y por lo tanto le corresponde a él reanudarla al
 * reconectar) — a diferencia de una pausa que el usuario eligió a mano
 * desde la app, que nunca debe tocar.
 */
async function pauseUserReminders(userId) {
  const { error } = await supabaseAdmin
    .from('recordatorios')
    .update({ estado: 'pausado', pausado_por_desconexion: true })
    .eq('user_id', userId)
    .eq('estado', 'pendiente');
  if (error) console.error(`[sessionManager] no se pudieron pausar los recordatorios (${userId}):`, error.message);
}

/**
 * `resumeUserReminders()` corre en CUALQUIER reconexión de WhatsApp, no
 * solo tras un logout — también en una reconexión normal (ej. si WhatsApp
 * cierra la conexión sola cada tanto, algo que pasa aunque nadie haya
 * hecho nada, o un redeploy del backend). Antes reanudaba cualquier fila en
 * 'pausado' sin distinguir el motivo, así que una pausa indefinida que el
 * usuario eligió a propósito desde la app se reactivaba sola en la
 * siguiente reconexión de rutina — se reportó como "pauso indefinidamente
 * y al día siguiente se vuelve a activar solo". Ahora solo toca filas con
 * `pausado_por_desconexion = true` (las que ESTE mecanismo pausó), nunca
 * una pausa manual — sin importar si esa pausa manual es indefinida o
 * tiene una fecha (esa se reanuda sola por su cuenta vía
 * resumeExpiredPauses() en reminders.js, o a mano).
 */
async function resumeUserReminders(userId) {
  const { error } = await supabaseAdmin
    .from('recordatorios')
    .update({ estado: 'pendiente', pausado_por_desconexion: false })
    .eq('user_id', userId)
    .eq('estado', 'pausado')
    .eq('pausado_por_desconexion', true);
  if (error) console.error(`[sessionManager] no se pudieron reanudar los recordatorios (${userId}):`, error.message);
}

function upsertContacts(entry, contacts) {
  for (const c of contacts || []) {
    if (!c?.id || !c.id.endsWith('@s.whatsapp.net')) continue; // salta grupos/broadcast
    const existing = entry.contacts.get(c.id);
    const name = c.name || c.notify || existing?.name || null;
    entry.contacts.set(c.id, { name });
  }
}

function attachHandlers(userId, entry, sock, saveCreds) {
  sock.ev.on('creds.update', saveCreds);

  // La libreta de contactos llega de forma asíncrona por estos eventos
  // (altas nuevas, actualizaciones de nombre) — Baileys no emite un
  // 'contacts.set' con el volcado inicial completo salvo que el socket haga
  // su sync automático de historial (gobernado por `syncFullHistory`, que
  // aquí está en `false` a propósito por memoria); ver la nota larga en
  // resyncContacts() sobre cómo se obtiene la lista completa igual.
  sock.ev.on('contacts.upsert', (contacts) => upsertContacts(entry, contacts));
  sock.ev.on('contacts.update', (updates) => upsertContacts(entry, updates));

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qr = await QRCode.toDataURL(qr);
      entry.status = 'qr';
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.qr = null;
      entry.pairingCode = null;
      // Baileys solo pone creds.registered = true a su propia iniciativa en
      // el flujo de código de vinculación (mensajes-recv.js) — vinculando
      // por QR ese campo se queda en `false` para siempre, aunque la cuenta
      // esté conectada y en uso desde hace semanas. Como startSession() usa
      // `registered` para decidir si un creds.me viejo es de un intento
      // abandonado o de una cuenta ya vinculada de verdad, se marca aquí a
      // mano en cuanto la conexión abre — sin importar qué método se usó —
      // para que un reinicio del backend más adelante no confunda una
      // cuenta vinculada por QR con un intento abandonado.
      if (!entry.authHandle.state.creds.registered) {
        entry.authHandle.state.creds.registered = true;
        saveCreds().catch((err) => console.error(`[sessionManager] no se pudo guardar registered=true (${userId}):`, err.message));
      }
      // Cubre tanto reconectar tras un logout manual (reanuda lo que se
      // pausó al desvincular) como el bootstrap normal al arrancar el
      // proceso — si no había nada pausado, este update no encuentra filas
      // y no hace nada.
      resumeUserReminders(userId).catch((err) => console.error(`[sessionManager] resumeUserReminders falló (${userId}):`, err));
    }

    if (connection === 'close') {
      const { DisconnectReason } = await loadBaileys();
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        entry.status = 'disconnected';
        entry.qr = null;
        entry.sock = null;
        await entry.authHandle.clearCreds();
      } else {
        // Importante: dejar en 'disconnected' (no 'connecting') antes de
        // llamar a startSession(). Si aquí se pusiera 'connecting', el guard
        // del inicio de startSession vería el estado ya en 'connecting' y
        // se saldría sin reconectar nunca — la sesión quedaría trabada.
        entry.status = 'disconnected';
        entry.sock = null;
        startSession(userId, { internal: true }).catch((err) =>
          console.error(`[sessionManager] reconexión falló (${userId}):`, err)
        );
      }
    }
  });

  return entry;
}

function getStatus(userId) {
  return sessions.get(userId)?.status ?? 'disconnected';
}

function getQR(userId) {
  return sessions.get(userId)?.qr ?? null;
}

function getPairingCode(userId) {
  return sessions.get(userId)?.pairingCode ?? null;
}

/**
 * Alternativa al QR para vincular: WhatsApp genera un código de 8
 * caracteres que el usuario escribe a mano en su teléfono (Ajustes >
 * Dispositivos vinculados > Vincular con número de teléfono), útil cuando
 * solo tiene un dispositivo y no puede escanear un QR desde otro. Reusa el
 * mismo socket que startSession() ya deja listo (o arranca uno si hace
 * falta) — WhatsApp acepta pedir el código antes de que termine de
 * vincularse, igual que acepta mostrar el QR.
 */
async function requestPairingCode(userId, phoneNumber) {
  const entry = await startSession(userId);
  if (!entry.sock) throw new Error('No se pudo iniciar la sesión de WhatsApp');
  if (entry.authHandle?.state?.creds?.registered) {
    throw new Error('Ya hay una sesión de WhatsApp vinculada');
  }

  const digits = String(phoneNumber).replace(/\D/g, '');
  if (!digits) throw new Error('Número de teléfono inválido');

  // startSession() devuelve el socket en cuanto lo crea, pero el WebSocket
  // subyacente todavía está conectándose en ese momento — requestPairingCode()
  // manda su paquete de inmediato (no lo encola) y lanza "Connection Closed"
  // si el socket todavía no está abierto. Sin este await, pedir el código
  // fallaba en silencio casi siempre (la ventana de tiempo entre crear el
  // socket y que abra es de milisegundos, pero suficiente para perderla).
  await entry.sock.waitForSocketOpen();
  const code = await entry.sock.requestPairingCode(digits);
  entry.pairingCode = code;

  // sock.requestPairingCode() dispara el guardado de creds (pairingCode,
  // me, y la llave efímera ya existente que se usó para cifrar el paquete
  // que WhatsApp acaba de recibir) vía el listener de 'creds.update', pero
  // sin esperar a que esa escritura en Supabase termine. Si por lo que sea
  // el socket tuviera que reconectarse justo en ese instante y volviera a
  // leer las credenciales de Supabase antes de que ese guardado terminara,
  // podría no encontrar todavía el pairingCode/me recién puestos. Se espera
  // aquí explícitamente para no depender de ese timing.
  await entry.authHandle.saveCreds();
  return code;
}

function getQueueLength(userId) {
  return sessions.get(userId)?.queue.length ?? 0;
}

/**
 * Número de WhatsApp conectado (desde donde se están enviando los mensajes
 * de este usuario), tomado del propio socket de Baileys una vez conectado.
 * El JID trae un sufijo de dispositivo multi-device (":12") y el dominio
 * ("@s.whatsapp.net") que hay que recortar para quedarnos solo con el número.
 */
function getPhoneNumber(userId) {
  const jid = sessions.get(userId)?.sock?.user?.id;
  if (!jid) return null;
  const digits = jid.split(':')[0].split('@')[0];
  return `+${digits}`;
}

/**
 * Contactos de WhatsApp conocidos para este usuario (para importarlos como
 * clientes). Solo devuelve contactos con número de teléfono válido —
 * descarta grupos y entradas sin dígitos limpios.
 */
function getContacts(userId) {
  const entry = sessions.get(userId);
  if (!entry?.contacts) return [];

  const result = [];
  for (const [jid, info] of entry.contacts.entries()) {
    const digits = jid.split('@')[0];
    if (!/^\d{7,15}$/.test(digits)) continue;
    result.push({ phone: `+${digits}`, name: info.name || null });
  }
  return result.sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone));
}

/**
 * Grupos de WhatsApp en los que participa el usuario, para importarlos como
 * "contactos" que son grupos (ver 006_grupos_whatsapp.sql). A diferencia de
 * los contactos individuales (que llegan solos por eventos), esto es una
 * consulta directa a WhatsApp bajo demanda — siempre trae la lista actual.
 */
async function getGroups(userId) {
  const entry = sessions.get(userId);
  if (!entry?.sock) throw new Error('Sesión de WhatsApp no conectada');

  const groups = await entry.sock.groupFetchAllParticipating();
  return Object.values(groups)
    .map((g) => ({
      jid: g.id,
      name: g.subject || g.id,
      participantsCount: g.participants?.length ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fuerza una resincronización completa del app-state (contactos, chats,
 * etc.) con los servidores de WhatsApp.
 *
 * Por qué esto es necesario y no basta con `sock.resyncAppState(...)` a
 * secas: Baileys internamente decide si pedir un "snapshot" completo de una
 * colección (ej. contactos) o solo los cambios ("patches") desde la última
 * vez, mirando un número de versión que persiste en `wa_sessions` (nuestro
 * `authState.keys` con categoría `app-state-sync-version`). Ese número de
 * versión sobrevive a un reinicio del proceso porque vive en Supabase, pero
 * el `Map` en memoria de `entry.contacts` (sección de arriba) NO sobrevive
 * — se resetea a vacío en cada redeploy/reinicio. El resultado: tras un
 * reinicio, un resync "normal" ve que ya tiene una versión > 0 guardada,
 * pide solo los cambios desde ahí, WhatsApp no tiene nada nuevo que
 * reportar, y `entry.contacts` se queda vacío para siempre aunque el
 * usuario sí tenga contactos.
 *
 * Por eso antes de resincronizar se borran las versiones guardadas de las
 * 5 colecciones (`ALL_WA_PATCH_NAMES`) — así Baileys las trata como nunca
 * sincronizadas y pide un snapshot completo, no un delta.
 */
async function resyncContacts(userId) {
  const entry = sessions.get(userId);
  if (!entry?.sock) throw new Error('Sesión de WhatsApp no conectada');
  const { ALL_WA_PATCH_NAMES } = await loadBaileys();
  await entry.authHandle.state.keys.set({
    'app-state-sync-version': Object.fromEntries(ALL_WA_PATCH_NAMES.map((name) => [name, null])),
  });
  await entry.sock.resyncAppState(ALL_WA_PATCH_NAMES, false);
}

/**
 * Desvincula el número de WhatsApp de un usuario: cierra el socket, borra
 * sus credenciales de `wa_sessions` y limpia el estado en memoria, para que
 * la próxima vez que llame a connect() se genere un QR nuevo (ej. si quiere
 * cambiar de número).
 */
async function logoutSession(userId) {
  const entry = sessions.get(userId);
  if (entry?.sock) {
    try {
      await entry.sock.logout();
    } catch (err) {
      console.error(`[sessionManager] logout() falló (${userId}):`, err.message);
    }
  }
  // Por si no había socket vivo en memoria pero sí credenciales guardadas.
  const { clearCreds } = await useSupabaseAuthState(userId);
  await clearCreds();
  sessions.delete(userId);
  await pauseUserReminders(userId);
}

/**
 * Ver la nota de resolveJid original: construir el JID a mano puede
 * "enviarse" sin error aunque el número no exista en WhatsApp. Se resuelve
 * usando el socket propio de CADA usuario (su número, su libreta de
 * contactos válidos).
 */
async function resolveJid(userId, phone) {
  const entry = sessions.get(userId);
  if (!entry?.sock) return null;
  const digits = String(phone).replace(/\D/g, '');
  const [result] = await entry.sock.onWhatsApp(digits);
  return result?.exists ? result.jid : null;
}

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

const ACK_TIMEOUT_MS = 25_000;

/**
 * Número propio de la sesión (mismo cálculo que getPhoneNumber), solo los
 * dígitos, para reconocer un envío "nota a mí mismo".
 */
function getOwnDigits(sock) {
  const jid = sock.user?.id;
  if (!jid) return null;
  return jid.split(':')[0].split('@')[0];
}

/**
 * sock.sendMessage() resuelve en cuanto WhatsApp ACEPTA el mensaje para
 * entregarlo, no cuando lo entrega de verdad — así que un envío que
 * WhatsApp descarta en silencio (el mismo tipo de bloqueo anti-spam ya
 * documentado para sesiones/números nuevos) antes se marcaba como exitoso
 * sin más.
 *
 * Primer intento de este chequeo esperaba SERVER_ACK (WhatsApp confirmó que
 * RECIBIÓ el mensaje), pero eso no demostró ser suficiente: un mensaje
 * bloqueado en silencio por el anti-spam de WhatsApp igual puede recibir
 * SERVER_ACK antes de descartarse camino al destinatario. Ahora se exige
 * DELIVERY_ACK (el destinatario lo recibió de verdad) antes de dar el envío
 * por bueno.
 *
 * Excepción: un mensaje a uno mismo ("nota a mí", mismo número que la sesión
 * conectada) no tiene "otra parte" que genere un DELIVERY_ACK normal — para
 * ese caso se confía directamente en que sendMessage() no haya lanzado error.
 *
 * Excepción #2: un grupo (JID termina en "@g.us") tampoco tiene un único
 * DELIVERY_ACK limpio que esperar — a diferencia de un chat 1:1, "entregado"
 * en un grupo depende de cada participante por separado, y en la práctica
 * se observó un mensaje que sí llegó de verdad al grupo (confirmado
 * visualmente) pero cuyo `messages.update` nunca alcanzó DELIVERY_ACK antes
 * del timeout — el recordatorio se marcaba `fallido` sin haber fallado, y
 * como esto pasaba en el primer envío de un grupo de varias imágenes,
 * abortaba el resto sin mandarlas (ver processQueue). Igual que con el
 * autoenvío, para un grupo se confía en que sendMessage() no haya lanzado
 * error, sin esperar ningún ACK adicional.
 */
async function sendAndConfirmDelivery(sock, jid, content) {
  const sent = await sock.sendMessage(jid, content);

  const targetDigits = jid.split('@')[0];
  const isGroup = jid.endsWith('@g.us');
  if (isGroup || targetDigits === getOwnDigits(sock)) return sent;

  const messageId = sent?.key?.id;
  if (!messageId) return sent; // no hay id que rastrear; no hay más que confiar en que no lanzó error

  const { proto } = await loadBaileys();

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sock.ev.off('messages.update', onUpdate);
      reject(new Error('WhatsApp no confirmó la entrega del mensaje a tiempo'));
    }, ACK_TIMEOUT_MS);

    function onUpdate(updates) {
      for (const { key, update } of updates) {
        if (key?.id !== messageId) continue;
        if (update?.status === proto.WebMessageInfo.Status.ERROR) {
          clearTimeout(timeout);
          sock.ev.off('messages.update', onUpdate);
          reject(new Error('WhatsApp reportó un error al entregar el mensaje'));
          return;
        }
        if ((update?.status ?? 0) >= proto.WebMessageInfo.Status.DELIVERY_ACK) {
          clearTimeout(timeout);
          sock.ev.off('messages.update', onUpdate);
          resolve();
          return;
        }
      }
    }

    sock.ev.on('messages.update', onUpdate);
  });

  return sent;
}

// Pausa fija entre los envíos de un mismo grupo (ej. la 2a, 3a... imagen de
// un recordatorio con varias fotos) — deliberadamente mucho más corta que
// randomDelay(). El espaciado anti-ban largo existe para no parecer un bot
// mandando ráfagas a chats distintos; mandar varias imágenes seguidas al
// MISMO chat como parte de un solo recordatorio es justo lo que hace una
// persona real al compartir varias fotos juntas, así que no necesita ese
// mismo resguardo.
const GROUP_ITEM_DELAY_MS = 1500;

/**
 * `contents` es un objeto de contenido de Baileys ({ text } o
 * { image: Buffer, caption }) o un arreglo de varios — un recordatorio con
 * varias imágenes encola el arreglo completo como una sola unidad. Resolver
 * una URL de adjunto a Buffer es responsabilidad de quien encola
 * (reminders.js), no de la cola en sí.
 *
 * El resultado (éxito/fallo) que recibe `onResult` es siempre el del primer
 * elemento — es el que lleva el texto del recordatorio y el que determina si
 * se marca como enviado o fallido. Los elementos siguientes son best-effort:
 * si alguno falla, se registra en logs pero no cambia ese resultado, porque
 * el recordatorio ya se dio por entregado con el primero.
 */
function enqueueMessage(userId, jid, contents, onResult) {
  const entry = getOrInitEntry(userId);
  entry.queue.push({ jid, contents, onResult });
  processQueue(userId);
}

/**
 * Si `items` son varias imágenes, WhatsApp puede mostrarlas agrupadas en
 * una sola cuadrícula (como un álbum real) en vez de como mensajes sueltos
 * — pero eso requiere un mensaje "álbum" (protocolo interno, sin contenido
 * visible propio) enviado ANTES, cuya `key` cada imagen real referencia via
 * `albumParentKey` para asociarse a él (`MEDIA_ALBUM`). Devuelve la key del
 * álbum si aplica, o `null` si `items` no es un caso de varias imágenes —
 * en ese caso el llamador manda el/los contenidos tal cual, sin tocar nada.
 *
 * Requiere Baileys 7.x — la versión estable (6.x) no soporta enviar álbumes,
 * solo tiene el tipo de protobuf para *recibir* uno que mandó otro cliente.
 */
async function startAlbumIfNeeded(sock, jid, items) {
  const esVariasImagenes = items.length > 1 && items.every((item) => 'image' in item);
  if (!esVariasImagenes) return null;

  const albumMsg = await sock.sendMessage(jid, {
    album: { expectedImageCount: items.length, expectedVideoCount: 0 },
  });
  return albumMsg?.key ?? null;
}

async function processQueue(userId) {
  const entry = sessions.get(userId);
  if (!entry || entry.processing) return;
  entry.processing = true;

  while (entry.queue.length > 0) {
    const { jid, contents, onResult } = entry.queue.shift();
    const items = Array.isArray(contents) ? contents : [contents];

    try {
      if (!entry.sock) throw new Error('Sesión de WhatsApp no conectada');

      const albumKey = await startAlbumIfNeeded(entry.sock, jid, items);
      const conAlbum = (item) => (albumKey ? { ...item, albumParentKey: albumKey } : item);

      await sendAndConfirmDelivery(entry.sock, jid, conAlbum(items[0]));
      onResult?.(null, { success: true });

      for (const extra of items.slice(1)) {
        // Ya no hace falta esperar tanto entre imágenes de un mismo álbum
        // como con mensajes sueltos — igual se deja un respiro corto para
        // no mandar todo en el mismo instante.
        await new Promise((resolve) => setTimeout(resolve, GROUP_ITEM_DELAY_MS));
        try {
          await sendAndConfirmDelivery(entry.sock, jid, conAlbum(extra));
        } catch (err) {
          console.error(`[sessionManager] envío adicional del grupo falló (${userId} -> ${jid}):`, err.message);
        }
      }
    } catch (err) {
      onResult?.(err);
    }
    if (entry.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, randomDelay()));
    }
  }

  entry.processing = false;
}

/**
 * Al arrancar el proceso, reconecta solo las sesiones que ya tenían
 * credenciales guardadas (usuarios que ya habían escaneado su QR antes).
 * Deliberadamente NO crea sesiones para usuarios que nunca han vinculado
 * WhatsApp: cada socket de Baileys vivo cuesta memoria, y en un contenedor
 * de 512MB no queremos levantar sockets que nadie va a usar todavía.
 */
async function bootstrapExistingSessions() {
  const { data, error } = await supabaseAdmin.from('wa_sessions').select('session_id').eq('key_id', 'creds');
  if (error) {
    console.error('[sessionManager] no se pudo listar sesiones existentes:', error.message);
    return;
  }
  const userIds = [...new Set((data || []).map((row) => row.session_id))];
  for (const userId of userIds) {
    startSession(userId).catch((err) => console.error(`[sessionManager] bootstrap falló (${userId}):`, err));
  }
}

module.exports = {
  startSession,
  getStatus,
  getQR,
  getPairingCode,
  requestPairingCode,
  getQueueLength,
  getPhoneNumber,
  getContacts,
  getGroups,
  resyncContacts,
  logoutSession,
  resolveJid,
  enqueueMessage,
  bootstrapExistingSessions,
};
