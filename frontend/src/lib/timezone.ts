/**
 * WhatsApp/Baileys no expone la zona horaria del teléfono vinculado, así que
 * los recordatorios se programan según la zona horaria guardada en el
 * perfil del usuario (autodetectada al conectar, editable en /perfil) en
 * vez de la del navegador donde se abre el formulario — pueden no coincidir
 * si se administra la cuenta desde otro dispositivo.
 */

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function partsOf(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // Intl puede devolver "24" para la medianoche en vez de "00".
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/**
 * Convierte una fecha/hora "de pared" (tal como la vería alguien parado en
 * `timeZone`, ej. lo que el usuario escribió en el formulario) al instante
 * UTC real que representa. No existe una forma nativa de construir un Date
 * directamente "en" una zona horaria arbitraria — se resuelve armando una
 * fecha candidata interpretando esos mismos números como UTC, viendo qué
 * hora marcaría un reloj en `timeZone` para ese instante candidato, y
 * corrigiendo por la diferencia (mismo truco que usa date-fns-tz sin traer
 * la librería completa).
 */
export function zonedTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);

  const seenAsZoned = partsOf(new Date(utcGuess), timeZone);
  const asIfUtc = Date.UTC(
    seenAsZoned.year,
    seenAsZoned.month - 1,
    seenAsZoned.day,
    seenAsZoned.hour,
    seenAsZoned.minute,
    seenAsZoned.second
  );
  const offsetMs = asIfUtc - utcGuess;

  return new Date(utcGuess - offsetMs).toISOString();
}

/** Inverso de zonedTimeToUtcIso: descompone un instante UTC en {dateStr, timeStr} tal como se ven en `timeZone`. */
export function utcIsoToZonedParts(iso: string, timeZone: string): { dateStr: string; timeStr: string } {
  const p = partsOf(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateStr: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    timeStr: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}
