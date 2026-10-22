/** Source date is not an intraday quote timestamp. */
export function pakistanDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string): string => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function dateAgeDays(date: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date)
    return null;
  const age = Math.round((Date.parse(`${pakistanDate(now)}T00:00:00Z`) - timestamp) / 86400000);
  return age >= 0 ? age : null;
}
export function priceFreshness(
  date: string,
  maxAgeDays: number,
  now = new Date(),
): 'LIVE' | 'STALE' | 'UNAVAILABLE' {
  const age = dateAgeDays(date, now);
  return age === null ? 'UNAVAILABLE' : age > maxAgeDays ? 'STALE' : 'LIVE';
}
export function approvedAmisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['amis.pk', 'www.amis.pk'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || ['80', '443'].includes(url.port))
    );
  } catch {
    return false;
  }
}
