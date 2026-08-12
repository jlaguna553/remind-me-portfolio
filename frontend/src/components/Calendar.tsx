'use client';

import { useState } from 'react';

interface Props {
  selected: string[];
  onToggle: (dateStr: string) => void;
  locale: string;
  markedDates?: string[];
  /** Días en que un recordatorio recurrente se repetirá (sin fila propia todavía) — punto de otro color. */
  recurringDates?: string[];
  /** Si es false, permite navegar y seleccionar días pasados (para revisar la agenda). */
  disablePast?: boolean;
  /** Mes mostrado, en modo controlado (para que el padre calcule marcas según el mes visible). */
  month?: Date;
  onMonthChange?: (month: Date) => void;
}

const WEEKDAYS: Record<string, string[]> = {
  es: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
};

export function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function Calendar({
  selected,
  onToggle,
  locale,
  markedDates = [],
  recurringDates = [],
  disablePast = true,
  month,
  onMonthChange,
}: Props) {
  const [internalCursor, setInternalCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const cursor = month ?? internalCursor;

  function setCursor(next: Date) {
    if (onMonthChange) onMonthChange(next);
    else setInternalCursor(next);
  }

  const today = startOfToday();
  const todayStr = toDateStr(today);
  const year = cursor.getFullYear();
  const month0 = cursor.getMonth();
  const firstDay = new Date(year, month0, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const intlLocale = locale === 'es' ? 'es-MX' : 'en-US';

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month0, day));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          aria-label="prev"
          onClick={() => setCursor(new Date(year, month0 - 1, 1))}
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
        >
          ‹
        </button>
        <span className="text-sm font-semibold capitalize text-slate-900">
          {cursor.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          aria-label="next"
          onClick={() => setCursor(new Date(year, month0 + 1, 1))}
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-slate-400">
        {(WEEKDAYS[locale] ?? WEEKDAYS.en).map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const dateStr = toDateStr(date);
          const isPast = date < today;
          const isToday = dateStr === todayStr;
          const isSelected = selected.includes(dateStr);
          const isMarked = markedDates.includes(dateStr);
          // No se excluye cuando isMarked: el día donde vive la fila real de
          // un recordatorio recurrente también debe verse violeta, no solo
          // sus repeticiones futuras proyectadas — el violeta gana sobre el
          // verde para que sea obvio cuál recordatorio es recurrente.
          const isRecurring = recurringDates.includes(dateStr);
          const disabled = disablePast && isPast && !isToday;

          return (
            <div key={i} className="flex justify-center py-0.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(dateStr)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition ${
                  isSelected
                    ? 'bg-emerald-600 font-semibold text-white'
                    : isToday
                      ? 'bg-red-500 font-semibold text-white'
                      : disabled
                        ? 'text-slate-300'
                        : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {date.getDate()}
                {(isMarked || isRecurring) && !isSelected && (
                  <span
                    className={`absolute bottom-1 h-1 w-1 rounded-full ${
                      isToday ? 'bg-white' : isRecurring ? 'bg-violet-500' : 'bg-emerald-500'
                    }`}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
