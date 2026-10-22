import { isValidTimeZone, quietHoursDelayMs } from '../src/domain/notifications/quiet-hours';

const KARACHI = 'Asia/Karachi'; // UTC+5, no daylight saving
const at = (iso: string): Date => new Date(iso);
const minutes = (n: number): number => n * 60_000;

describe('quietHoursDelayMs', () => {
  it('returns 0 when no window is configured or the window is empty/invalid', () => {
    const now = at('2026-10-15T20:00:00Z');
    expect(quietHoursDelayMs(now, null, null, KARACHI)).toBe(0);
    expect(quietHoursDelayMs(now, '22:00', null, KARACHI)).toBe(0);
    expect(quietHoursDelayMs(now, '22:00', '22:00', KARACHI)).toBe(0);
    expect(quietHoursDelayMs(now, 'bad', '06:00', KARACHI)).toBe(0);
    expect(quietHoursDelayMs(now, '22:00', '06:00', 'Not/AZone')).toBe(0);
  });

  it('delays until the end of a same-day window and not outside it', () => {
    // 13:00–15:00 Karachi; 09:30Z = 14:30 Karachi
    expect(quietHoursDelayMs(at('2026-10-15T09:30:00Z'), '13:00', '15:00', KARACHI)).toBe(
      minutes(30),
    );
    expect(quietHoursDelayMs(at('2026-10-15T07:59:00Z'), '13:00', '15:00', KARACHI)).toBe(0); // 12:59
    expect(quietHoursDelayMs(at('2026-10-15T10:00:00Z'), '13:00', '15:00', KARACHI)).toBe(0); // 15:00 end is exclusive
    expect(quietHoursDelayMs(at('2026-10-15T08:00:00Z'), '13:00', '15:00', KARACHI)).toBe(
      minutes(120),
    ); // 13:00 start is inclusive
  });

  it('handles windows that cross midnight, on both sides of midnight', () => {
    // 22:00–06:00 Karachi. 18:00Z = 23:00 local -> 7 h to 06:00.
    expect(quietHoursDelayMs(at('2026-10-15T18:00:00Z'), '22:00', '06:00', KARACHI)).toBe(
      minutes(7 * 60),
    );
    // 22:00Z = 03:00 local next day -> 3 h to 06:00.
    expect(quietHoursDelayMs(at('2026-10-15T22:00:00Z'), '22:00', '06:00', KARACHI)).toBe(
      minutes(3 * 60),
    );
    // 07:00Z = 12:00 local -> outside.
    expect(quietHoursDelayMs(at('2026-10-15T07:00:00Z'), '22:00', '06:00', KARACHI)).toBe(0);
    // exactly 06:00 local (01:00Z) is outside, 22:00 local (17:00Z) is inside.
    expect(quietHoursDelayMs(at('2026-10-15T01:00:00Z'), '22:00', '06:00', KARACHI)).toBe(0);
    expect(quietHoursDelayMs(at('2026-10-15T17:00:00Z'), '22:00', '06:00', KARACHI)).toBe(
      minutes(8 * 60),
    );
  });

  it('accounts for seconds so the delivery lands on the window end', () => {
    // 14:30:20 local -> 29 min 40 s remaining
    expect(quietHoursDelayMs(at('2026-10-15T09:30:20Z'), '13:00', '15:00', KARACHI)).toBe(
      minutes(29) + 40_000,
    );
  });

  it('interprets the window in the farmer time zone, including daylight saving zones', () => {
    // The same instant is quiet in Karachi but not in New York.
    const instant = at('2026-10-15T18:00:00Z'); // 23:00 Karachi, 14:00 New York (EDT)
    expect(quietHoursDelayMs(instant, '22:00', '06:00', KARACHI)).toBeGreaterThan(0);
    expect(quietHoursDelayMs(instant, '22:00', '06:00', 'America/New_York')).toBe(0);
    // After the US change back to standard time (2026-11-01) the offset moves from -4 to -5.
    expect(
      quietHoursDelayMs(at('2026-10-31T23:30:00Z'), '19:00', '20:00', 'America/New_York'),
    ).toBe(minutes(30)); // 19:30 EDT
    expect(
      quietHoursDelayMs(at('2026-11-02T00:30:00Z'), '19:00', '20:00', 'America/New_York'),
    ).toBe(minutes(30)); // 19:30 EST
  });

  it('accepts HH:MM:SS values from PostgreSQL time columns', () => {
    expect(quietHoursDelayMs(at('2026-10-15T09:30:00Z'), '13:00:00', '15:00:00', KARACHI)).toBe(
      minutes(30),
    );
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimeZone('Asia/Karachi')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    for (const bad of ['', 'Karachi', 'Mars/Olympus', 'GMT+5000', "Asia/Karachi'; DROP TABLE x;--"])
      expect(isValidTimeZone(bad)).toBe(false);
  });
});
