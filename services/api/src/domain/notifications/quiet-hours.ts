/** Validates an IANA time zone name (for example "Asia/Karachi"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function minutesOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Milliseconds to wait before a notification may be delivered. Returns 0 when `now` is outside the
 * quiet window, or when the window is missing, invalid, or empty (start equals end). The window may
 * cross midnight (for example 22:00–06:00). Times are interpreted in `timeZone`.
 */
export function quietHoursDelayMs(
  now: Date,
  start: string | null,
  end: string | null,
  timeZone: string,
): number {
  if (!start || !end || !isValidTimeZone(timeZone)) return 0;
  const from = minutesOfDay(start);
  const to = minutesOfDay(end);
  if (from === null || to === null || from === to) return 0;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const current = part('hour') * 60 + part('minute');
  const inside = from < to ? current >= from && current < to : current >= from || current < to;
  if (!inside) return 0;
  const minutesLeft = (to - current + 1440) % 1440;
  return Math.max(0, minutesLeft * 60_000 - part('second') * 1000);
}
