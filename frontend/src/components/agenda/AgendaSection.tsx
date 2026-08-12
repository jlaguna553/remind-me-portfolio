'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/i18n/LanguageProvider';
import Calendar, { toDateStr } from '@/components/Calendar';
import ReminderCard from '@/components/agenda/ReminderCard';
import { occurrencesInRange } from '@/lib/recurrence';
import { formatCountdown, MS_PER_MINUTE } from '@/lib/countdown';
import type { Recordatorio } from '@/types/db';

interface Props {
  recordatorios: Recordatorio[];
  loading: boolean;
  onCancel: (id: string) => Promise<{ error: string | null }>;
  onPause: (id: string, pausadoHasta: string | null) => Promise<{ error: string | null }>;
  onResume: (id: string) => Promise<{ error: string | null }>;
  onSendNow: (id: string) => Promise<{ error: string | null }>;
  onDuplicate: (r: Recordatorio) => void;
}

/**
 * Módulo de solo consulta: navega el mes/día y muestra lo agendado. Crear y
 * editar viven en pantallas separadas (/calendario/nuevo,
 * /calendario/editar/[id]) para no mezclar "el calendario para ver la
 * agenda" con "el calendario para elegir una fecha del formulario".
 */
export default function AgendaSection({
  recordatorios,
  loading,
  onCancel,
  onPause,
  onResume,
  onSendNow,
  onDuplicate,
}: Props) {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  // Cuenta atrás de las tarjetas "Se repetirá aquí" (más abajo) — un tick
  // por minuto es de sobra, igual que en ReminderCard.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), MS_PER_MINUTE);
    return () => clearInterval(interval);
  }, []);

  const monthRange = useMemo(() => {
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    // 23:59:59.999 del último día, no medianoche — si no, una ocurrencia con
    // hora (ej. 9am) del último día del mes queda fuera del rango.
    const end = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }, [visibleMonth]);

  const markedDates = useMemo(
    () => [...new Set(recordatorios.map((r) => toDateStr(new Date(r.fecha_envio))))],
    [recordatorios]
  );

  // Un recordatorio recurrente solo tiene UNA fila en la base de datos (la
  // próxima vez que se enviará); para que el calendario muestre en qué otros
  // días del mes se repetirá, se proyectan sus futuras ocurrencias en el
  // frontend con la misma lógica de frecuencia que usa el backend.
  const recurringDates = useMemo(() => {
    const set = new Set<string>();
    for (const r of recordatorios) {
      if (!r.es_recurrente || !r.frecuencia || r.estado === 'pausado') continue;
      const occurrences = occurrencesInRange(
        new Date(r.fecha_envio),
        r.frecuencia,
        r.intervalo_dias,
        r.fecha_fin ? new Date(r.fecha_fin) : null,
        monthRange.start,
        monthRange.end,
        r.dias_permitidos
      );
      for (const d of occurrences) set.add(toDateStr(d));
    }
    return [...set];
  }, [recordatorios, monthRange]);

  const dayReminders = useMemo(
    () =>
      recordatorios
        .filter((r) => toDateStr(new Date(r.fecha_envio)) === selectedDate)
        .sort((a, b) => new Date(a.fecha_envio).getTime() - new Date(b.fecha_envio).getTime()),
    [recordatorios, selectedDate]
  );

  // Recordatorios recurrentes que se repetirán en el día seleccionado, pero
  // que todavía no tienen una fila real ahí (su fila real vive en otra
  // fecha, la próxima que toque enviarse). Se guarda la ocurrencia exacta
  // (no solo si "cae" ese día) para poder mostrar cuánto falta.
  const projectedOnSelectedDay = useMemo(() => {
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const dayEnd = new Date(`${selectedDate}T23:59:59.999`);
    const result: { reminder: Recordatorio; ocurrencia: Date }[] = [];
    for (const r of recordatorios) {
      if (!r.es_recurrente || !r.frecuencia || r.estado === 'pausado') continue;
      if (toDateStr(new Date(r.fecha_envio)) === selectedDate) continue;
      const occurrences = occurrencesInRange(
        new Date(r.fecha_envio),
        r.frecuencia,
        r.intervalo_dias,
        r.fecha_fin ? new Date(r.fecha_fin) : null,
        dayStart,
        dayEnd,
        r.dias_permitidos
      );
      if (occurrences.length > 0) result.push({ reminder: r, ocurrencia: occurrences[0] });
    }
    return result;
  }, [recordatorios, selectedDate]);

  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
    locale === 'es' ? 'es-MX' : 'en-US',
    { weekday: 'long', day: 'numeric', month: 'long' }
  );

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t('nav.calendario')}</h2>
        <button
          type="button"
          onClick={() => router.push(`/calendario/nuevo?fecha=${selectedDate}`)}
          aria-label={t('recordatorios.schedule')}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-lg leading-none text-white hover:bg-emerald-500"
        >
          +
        </button>
      </div>

      <Calendar
        selected={[selectedDate]}
        onToggle={setSelectedDate}
        locale={locale}
        markedDates={markedDates}
        recurringDates={recurringDates}
        disablePast={false}
        month={visibleMonth}
        onMonthChange={setVisibleMonth}
      />

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t('recordatorios.legendScheduled')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          {t('recordatorios.legendRecurring')}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold capitalize text-slate-700">{selectedDateLabel}</h3>

        {loading ? (
          <p className="text-sm text-slate-400">{t('common.loading')}</p>
        ) : dayReminders.length === 0 && projectedOnSelectedDay.length === 0 ? (
          <p className="text-sm text-slate-400">{t('recordatorios.emptyDay')}</p>
        ) : (
          <>
            {dayReminders.length > 0 && (
              <ul className="space-y-2">
                {dayReminders.map((r) => (
                  <ReminderCard
                    key={r.id}
                    reminder={r}
                    locale={locale}
                    t={t}
                    onEdit={() => router.push(`/calendario/editar/${r.id}`)}
                    onCancel={onCancel}
                    onPause={onPause}
                    onResume={onResume}
                    onSendNow={onSendNow}
                    onDuplicate={onDuplicate}
                  />
                ))}
              </ul>
            )}

            {projectedOnSelectedDay.length > 0 && (
              <ul className="space-y-2">
                {projectedOnSelectedDay.map(({ reminder: r, ocurrencia }) => (
                  <li
                    key={`proyectado-${r.id}`}
                    className="rounded-xl border border-dashed border-violet-300 bg-violet-50 p-3 text-sm text-violet-900"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t('recordatorios.futureRepeat')}</span>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                        🔁 {t(`recordatorios.frecuencia.${r.frecuencia}`)}
                      </span>
                    </div>
                    <p className="text-xs text-violet-700/80">
                      {t('recordatorios.countdownPrefix')} {formatCountdown(ocurrencia.getTime() - now, t)}
                    </p>
                    <p className="mt-1 font-medium">{r.clientes?.nombre ?? '—'}</p>
                    <p className="text-violet-700/80">{r.mensaje_plantilla}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
