export const MS_PER_MINUTE = 60_000;

/**
 * "2d 3h" / "45min" — se limita a las 2 unidades más grandes para no saturar
 * la tarjeta con "2 días 3 horas 45 minutos"; a nivel de segundos no aporta
 * nada útil para algo que normalmente falta minutos u horas. `ms <= 0`
 * significa que ya debería haber pasado — se muestra un texto fijo en vez
 * de una cuenta negativa.
 */
export function formatCountdown(ms: number, t: (key: string) => string): string {
  if (ms <= 0) return t('recordatorios.countdownNow');
  const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${t('recordatorios.countdownDaysAbbr')}`);
  if (hours > 0) parts.push(`${hours}${t('recordatorios.countdownHoursAbbr')}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}${t('recordatorios.countdownMinutesAbbr')}`);
  return parts.slice(0, 2).join(' ');
}
