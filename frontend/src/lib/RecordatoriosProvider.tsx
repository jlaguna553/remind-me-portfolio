'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { authHeader } from '@/lib/authHeader';
import type { Frecuencia, Recordatorio } from '@/types/db';

const SELECT_FIELDS =
  'id, cliente_id, mensaje_plantilla, fecha_envio, estado, error, es_recurrente, frecuencia, intervalo_dias, fecha_fin, dias_permitidos, pausado_hasta, ultimo_envio, imagenes_urls, clientes(nombre, telefono, es_grupo)';

// Espacio mínimo entre dos recordatorios propios: manda todos desde el mismo
// número de WhatsApp, así que agendar varios en el mismo instante se vería
// igual de "ráfaga de bot" para WhatsApp que enviarlos así — aunque la cola
// anti-ban (backend) igual los espacia al momento de enviar, esto evita
// acumular de entrada más de lo que hace falta en el mismo minuto.
const MIN_GAP_MS = 60_000;

interface RecordatoriosContextValue {
  recordatorios: Recordatorio[];
  loading: boolean;
  addRecordatorio: (
    clienteId: string,
    mensaje: string,
    fechaEnvioIso: string,
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  addRecordatoriosMultiples: (
    clienteId: string,
    mensaje: string,
    fechasEnvioIso: string[],
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  addRecordatorioRecurrente: (
    clienteId: string,
    mensaje: string,
    fechaInicioIso: string,
    frecuencia: Frecuencia,
    intervaloDias: number | null,
    fechaFinIso: string | null,
    diasPermitidos: number[] | null,
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  updateRecordatorio: (
    id: string,
    mensaje: string,
    fechaEnvioIso: string,
    imagenesUrls?: string[]
  ) => Promise<{ error: string | null }>;
  cancelRecordatorio: (id: string) => Promise<{ error: string | null }>;
  sendRecordatorioAhora: (id: string) => Promise<{ error: string | null }>;
  /** pausadoHasta: null = pausa indefinida (solo se reanuda a mano); ISO = se reanuda solo llegada esa fecha. */
  pauseRecordatorio: (id: string, pausadoHasta: string | null) => Promise<{ error: string | null }>;
  resumeRecordatorio: (id: string) => Promise<{ error: string | null }>;
  pauseAllRecordatorios: (pausadoHasta: string | null) => Promise<{ error: string | null }>;
  resumeAllRecordatorios: () => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const RecordatoriosContext = createContext<RecordatoriosContextValue | null>(null);

/** Ver ClientesProvider — mismo motivo: que navegar entre páginas no vuelva a pedir todo desde cero. */
export function RecordatoriosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from('recordatorios').select(SELECT_FIELDS).order('fecha_envio', {
      ascending: true,
    });
    if (!error && data) setRecordatorios(data as unknown as Recordatorio[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Actualiza el estado en vivo cuando algo cambia un recordatorio por
  // fuera de esta pestaña — sobre todo el cron del backend marcándolo
  // 'enviado'/'fallido' al procesarlo, o el pausado/reanudado automático
  // al desvincular/reconectar WhatsApp (sessionManager.js). Sin esto, el
  // usuario tenía que refrescar la página a mano para dejar de ver un
  // recordatorio como "Pendiente" que ya se había enviado hace rato.
  // Postgres Changes de Supabase Realtime respeta las mismas policies de
  // RLS que el resto de las consultas (auth.uid() = user_id), así que el
  // filtro de abajo es una optimización de red, no la única barrera de
  // seguridad. Ante cualquier evento simplemente se vuelve a pedir la
  // lista completa en vez de mezclar el payload a mano — es una sola
  // consulta liviana y evita reconstruir el join con `clientes` (que
  // Postgres Changes no manda) fila por fila.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`recordatorios-realtime-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recordatorios', filter: `user_id=eq.${user.id}` },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  function findNearbyReminder(candidateIso: string, excludeId?: string) {
    const candidateTime = new Date(candidateIso).getTime();
    return recordatorios.find((r) => {
      if (excludeId && r.id === excludeId) return false;
      if (r.estado !== 'pendiente' && r.estado !== 'en_proceso') return false;
      return Math.abs(new Date(r.fecha_envio).getTime() - candidateTime) < MIN_GAP_MS;
    });
  }

  async function addRecordatorio(
    clienteId: string,
    mensaje: string,
    fechaEnvioIso: string,
    imagenesUrls: string[] = []
  ) {
    if (!user) return { error: 'No hay sesión activa' };
    if (findNearbyReminder(fechaEnvioIso)) return { error: t('recordatorios.tooClose') };

    const { error } = await supabase.from('recordatorios').insert({
      cliente_id: clienteId,
      mensaje_plantilla: mensaje,
      fecha_envio: fechaEnvioIso,
      user_id: user.id,
      imagenes_urls: imagenesUrls,
    });
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  // Modo "fechas específicas": una fila independiente por cada fecha elegida.
  async function addRecordatoriosMultiples(
    clienteId: string,
    mensaje: string,
    fechasEnvioIso: string[],
    imagenesUrls: string[] = []
  ) {
    if (!user) return { error: 'No hay sesión activa' };
    const colliding = fechasEnvioIso.find((f) => findNearbyReminder(f));
    if (colliding) return { error: t('recordatorios.tooClose') };

    const rows = fechasEnvioIso.map((fechaEnvio) => ({
      cliente_id: clienteId,
      mensaje_plantilla: mensaje,
      fecha_envio: fechaEnvio,
      user_id: user.id,
      imagenes_urls: imagenesUrls,
    }));
    const { error } = await supabase.from('recordatorios').insert(rows);
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  // Modo "recurrente": una sola fila que el backend reprograma sola tras cada envío.
  async function addRecordatorioRecurrente(
    clienteId: string,
    mensaje: string,
    fechaInicioIso: string,
    frecuencia: Frecuencia,
    intervaloDias: number | null,
    fechaFinIso: string | null,
    diasPermitidos: number[] | null,
    imagenesUrls: string[] = []
  ) {
    if (!user) return { error: 'No hay sesión activa' };
    if (findNearbyReminder(fechaInicioIso)) return { error: t('recordatorios.tooClose') };

    const { error } = await supabase.from('recordatorios').insert({
      cliente_id: clienteId,
      mensaje_plantilla: mensaje,
      fecha_envio: fechaInicioIso,
      user_id: user.id,
      es_recurrente: true,
      frecuencia,
      intervalo_dias: frecuencia === 'personalizada' ? intervaloDias : null,
      fecha_fin: fechaFinIso,
      dias_permitidos: diasPermitidos,
      imagenes_urls: imagenesUrls,
    });
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function updateRecordatorio(
    id: string,
    mensaje: string,
    fechaEnvioIso: string,
    imagenesUrls: string[] = []
  ) {
    if (findNearbyReminder(fechaEnvioIso, id)) return { error: t('recordatorios.tooClose') };

    const { error } = await supabase
      .from('recordatorios')
      .update({ mensaje_plantilla: mensaje, fecha_envio: fechaEnvioIso, imagenes_urls: imagenesUrls })
      .eq('id', id)
      .eq('estado', 'pendiente');
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function cancelRecordatorio(id: string) {
    const { error } = await supabase.from('recordatorios').delete().eq('id', id);
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  // A diferencia del resto de acciones (updates directos vía RLS), enviar
  // ahora necesita el socket de WhatsApp vivo del backend — pasa por la ruta
  // proxy en vez de Supabase directo. El backend deja la fila en
  // 'en_proceso' de inmediato y la cola anti-ban confirma 'enviado'/'fallido'
  // minutos después; Realtime (más arriba) recoge ese cambio solo.
  async function sendRecordatorioAhora(id: string) {
    const headers = await authHeader();
    const res = await fetch(`/api/reminders/${id}/send-now`, { method: 'POST', headers });
    const data = await res.json().catch(() => ({}));
    await refresh();
    return { error: res.ok ? null : data.error ?? t('recordatorios.sendNowError') };
  }

  // Pausar/reanudar un recordatorio individual: solo tiene sentido para uno
  // recurrente (uno único ya se puede cancelar sin más). Conserva toda su
  // configuración — a diferencia de cancelar, no borra la fila.
  // `pausadoHasta` null = pausa indefinida; si trae fecha, el backend la
  // reanuda solo al llegar esa fecha (resumeExpiredPauses() en reminders.js).
  // `pausado_por_desconexion: false` es lo que evita que resumeUserReminders()
  // (sessionManager.js, dispara en cualquier reconexión de WhatsApp) reanude
  // esta pausa por su cuenta — esa bandera es solo para pausas automáticas
  // del propio backend, nunca para una que el usuario eligió a mano.
  async function pauseRecordatorio(id: string, pausadoHasta: string | null) {
    const { error } = await supabase
      .from('recordatorios')
      .update({ estado: 'pausado', pausado_hasta: pausadoHasta, pausado_por_desconexion: false })
      .eq('id', id)
      .eq('estado', 'pendiente');
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function resumeRecordatorio(id: string) {
    const { error } = await supabase
      .from('recordatorios')
      .update({ estado: 'pendiente', pausado_hasta: null, pausado_por_desconexion: false })
      .eq('id', id)
      .eq('estado', 'pausado');
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  // Pausar/reanudar TODOS los recordatorios pendientes/pausados del usuario
  // de un golpe — usado desde "Mi perfil" y automáticamente al
  // desvincular/reconectar WhatsApp (esa parte vive en el backend,
  // sessionManager.js, porque ahí es donde se sabe cuándo cambia la
  // conexión; esto es la versión que el usuario dispara a mano).
  async function pauseAllRecordatorios(pausadoHasta: string | null) {
    if (!user) return { error: 'No hay sesión activa' };
    const { error } = await supabase
      .from('recordatorios')
      .update({ estado: 'pausado', pausado_hasta: pausadoHasta, pausado_por_desconexion: false })
      .eq('estado', 'pendiente');
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function resumeAllRecordatorios() {
    if (!user) return { error: 'No hay sesión activa' };
    const { error } = await supabase
      .from('recordatorios')
      .update({ estado: 'pendiente', pausado_hasta: null, pausado_por_desconexion: false })
      .eq('estado', 'pausado');
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  return (
    <RecordatoriosContext.Provider
      value={{
        recordatorios,
        loading,
        addRecordatorio,
        addRecordatoriosMultiples,
        addRecordatorioRecurrente,
        updateRecordatorio,
        cancelRecordatorio,
        sendRecordatorioAhora,
        pauseRecordatorio,
        resumeRecordatorio,
        pauseAllRecordatorios,
        resumeAllRecordatorios,
        refresh,
      }}
    >
      {children}
    </RecordatoriosContext.Provider>
  );
}

export function useRecordatoriosContext() {
  const ctx = useContext(RecordatoriosContext);
  if (!ctx) throw new Error('useRecordatoriosContext debe usarse dentro de RecordatoriosProvider');
  return ctx;
}
