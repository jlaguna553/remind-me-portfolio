import type { Frecuencia } from '@/types/db';

/** Mismo truco que ajustarADiaPermitido en backend/src/services/reminders.js. */
function ajustarADiaPermitido(date: Date, diasPermitidos: number[] | null): Date {
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
 * Misma lógica que computeNextFechaEnvio en backend/src/services/reminders.js,
 * reimplementada en el frontend para poder proyectar (sin llamar al backend)
 * en qué días futuros va a caer un recordatorio recurrente y así marcarlo en
 * el calendario. Duplicar esta función pequeña es más simple que compartir
 * código entre el backend Node y el frontend Next.js para este cálculo.
 */
export function nextOccurrence(
  current: Date,
  frecuencia: Frecuencia,
  intervaloDias: number | null,
  diasPermitidos: number[] | null = null
): Date {
  const next = new Date(current);
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

/**
 * Fechas en que un recordatorio recurrente caerá dentro de [rangeStart, rangeEnd],
 * partiendo de su fecha_envio actual. Acotado con maxSteps para no calcular
 * indefinidamente si no tiene fecha_fin.
 */
export function occurrencesInRange(
  startDate: Date,
  frecuencia: Frecuencia,
  intervaloDias: number | null,
  fechaFin: Date | null,
  rangeStart: Date,
  rangeEnd: Date,
  diasPermitidos: number[] | null = null,
  maxSteps = 62
): Date[] {
  const results: Date[] = [];
  let current = new Date(startDate);
  let steps = 0;

  while (current < rangeStart && steps < maxSteps && (!fechaFin || current <= fechaFin)) {
    current = nextOccurrence(current, frecuencia, intervaloDias, diasPermitidos);
    steps++;
  }

  while (current <= rangeEnd && steps < maxSteps && (!fechaFin || current <= fechaFin)) {
    if (current >= rangeStart) results.push(new Date(current));
    current = nextOccurrence(current, frecuencia, intervaloDias, diasPermitidos);
    steps++;
  }

  return results;
}
