'use client';

import { useEffect, useState } from 'react';
import { formatCountdown, MS_PER_MINUTE } from '@/lib/countdown';
import PausarPicker from '@/components/agenda/PausarPicker';
import type { EstadoRecordatorio, Recordatorio } from '@/types/db';

interface Props {
  reminder: Recordatorio;
  locale: string;
  t: (key: string) => string;
  /** Muestra fecha además de hora — útil en vistas que abarcan varios días (logs, mensajes por cliente). */
  showDate?: boolean;
  onEdit?: (r: Recordatorio) => void;
  onCancel?: (id: string) => void;
  /** Pausar/reanudar solo aplica a recordatorios recurrentes — uno único ya se cancela sin más. pausadoHasta: null = indefinida. */
  onPause?: (id: string, pausadoHasta: string | null) => void;
  onResume?: (id: string) => void;
  /** Manda el recordatorio en este instante en vez de esperar su fecha_envio programada. */
  onSendNow?: (id: string) => Promise<{ error: string | null }>;
  /** Precarga /calendario/nuevo con los datos de este recordatorio, sin tocar el original. */
  onDuplicate?: (r: Recordatorio) => void;
}

const ESTADO_CARD: Record<EstadoRecordatorio, string> = {
  pendiente: 'border-amber-400 bg-amber-50 text-amber-900',
  en_proceso: 'border-sky-400 bg-sky-50 text-sky-900',
  enviado: 'border-emerald-400 bg-emerald-50 text-emerald-900',
  fallido: 'border-red-400 bg-red-50 text-red-900',
  pausado: 'border-slate-300 bg-slate-50 text-slate-700',
};

const ESTADO_BADGE: Record<EstadoRecordatorio, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  en_proceso: 'bg-sky-100 text-sky-700',
  enviado: 'bg-emerald-100 text-emerald-700',
  fallido: 'bg-red-100 text-red-700',
  pausado: 'bg-slate-200 text-slate-600',
};

export default function ReminderCard({
  reminder: r,
  locale,
  t,
  showDate,
  onEdit,
  onCancel,
  onPause,
  onResume,
  onSendNow,
  onDuplicate,
}: Props) {
  const intlLocale = locale === 'es' ? 'es-MX' : 'en-US';
  const when = new Date(r.fecha_envio);
  const timeLabel = when.toLocaleTimeString(intlLocale, { hour: 'numeric', minute: '2-digit' });
  const dateLabel = when.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });

  const [sendingNow, setSendingNow] = useState(false);
  const [sendNowError, setSendNowError] = useState<string | null>(null);

  // Cuenta atrás en vivo, solo mientras sigue pendiente — no tiene caso
  // seguir recalculándola en una tarjeta ya enviada/pausada. Un tick por
  // minuto es de sobra: lo que se muestra nunca tiene precisión de segundos.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (r.estado !== 'pendiente') return;
    const interval = setInterval(() => setNow(Date.now()), MS_PER_MINUTE);
    return () => clearInterval(interval);
  }, [r.estado]);

  const countdownText = r.estado === 'pendiente' ? formatCountdown(when.getTime() - now, t) : null;

  async function handleSendNow() {
    if (!onSendNow) return;
    setSendingNow(true);
    setSendNowError(null);
    const { error } = await onSendNow(r.id);
    setSendingNow(false);
    if (error) setSendNowError(error);
  }

  const [showPausarPicker, setShowPausarPicker] = useState(false);

  function handleConfirmPausar(pausadoHasta: string | null) {
    onPause?.(r.id, pausadoHasta);
    setShowPausarPicker(false);
  }

  return (
    <li
      className={`rounded-xl border-l-4 p-3 text-sm ${ESTADO_CARD[r.estado]} ${
        r.es_recurrente ? 'ring-1 ring-violet-300' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{showDate ? `${dateLabel} · ${timeLabel}` : timeLabel}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE[r.estado]}`}>
          {t(`recordatorios.estado.${r.estado}`)}
        </span>
      </div>
      {countdownText && (
        <p className="text-xs text-slate-400">
          {t('recordatorios.countdownPrefix')} {countdownText}
        </p>
      )}
      <p className="mt-1 font-medium">
        {r.clientes?.es_grupo && '👥 '}
        {r.clientes?.nombre ?? '—'}
      </p>
      <p className="text-slate-600">
        {r.imagenes_urls.length > 0 && '📷 '}
        {r.mensaje_plantilla}
      </p>
      {r.imagenes_urls.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {r.imagenes_urls.map((url) => (
            <img key={url} src={url} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
          ))}
        </div>
      )}
      {r.es_recurrente && (
        <p className="mt-1 text-xs text-violet-700">
          🔁 {t(`recordatorios.frecuencia.${r.frecuencia}`)}
          {r.fecha_fin && ` ${t('recordatorios.recurrente.until')} ${new Date(r.fecha_fin).toLocaleDateString(intlLocale)}`}
        </p>
      )}
      {r.estado === 'pausado' && (
        <p className="mt-1 text-xs text-slate-500">
          {r.pausado_hasta
            ? `${t('recordatorios.pausadoHastaPrefix')} ${new Date(r.pausado_hasta).toLocaleString(intlLocale, {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}`
            : t('recordatorios.pausadoIndefinido')}
        </p>
      )}
      {r.error && <p className="mt-1 text-xs text-red-600">{r.error}</p>}
      {sendNowError && <p className="mt-1 text-xs text-red-600">{sendNowError}</p>}
      {(onDuplicate ||
        (r.estado === 'pendiente' && (onEdit || onCancel || onSendNow || (onPause && r.es_recurrente))) ||
        (r.estado === 'pausado' && (onResume || onCancel))) && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {r.estado === 'pendiente' && onSendNow && (
            <button
              onClick={handleSendNow}
              disabled={sendingNow}
              className="font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
            >
              {sendingNow ? t('recordatorios.sendingNow') : t('recordatorios.sendNow')}
            </button>
          )}
          {r.estado === 'pendiente' && onEdit && (
            <button onClick={() => onEdit(r)} className="font-medium text-sky-700 hover:text-sky-800">
              {t('common.edit')}
            </button>
          )}
          {r.estado === 'pendiente' && onPause && r.es_recurrente && (
            <button
              onClick={() => setShowPausarPicker((prev) => !prev)}
              className="font-medium text-slate-600 hover:text-slate-800"
            >
              {t('recordatorios.pause')}
            </button>
          )}
          {r.estado === 'pausado' && onResume && (
            <button onClick={() => onResume(r.id)} className="font-medium text-emerald-700 hover:text-emerald-800">
              {t('recordatorios.resume')}
            </button>
          )}
          {onDuplicate && (
            <button onClick={() => onDuplicate(r)} className="font-medium text-slate-600 hover:text-slate-800">
              {t('recordatorios.duplicate')}
            </button>
          )}
          {(r.estado === 'pendiente' || r.estado === 'pausado') && onCancel && (
            <button onClick={() => onCancel(r.id)} className="font-medium text-red-700 hover:text-red-800">
              {t('common.cancel')}
            </button>
          )}
        </div>
      )}
      {showPausarPicker && <PausarPicker onConfirm={handleConfirmPausar} onCancel={() => setShowPausarPicker(false)} />}
    </li>
  );
}
