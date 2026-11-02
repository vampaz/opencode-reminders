import { describe, expect, it } from 'vitest';

import { formatAbsolute, formatRelative, parseWhen } from './time';

const now = new Date(2026, 10, 1, 12, 0, 0);

describe('parseWhen', () => {
  it('reads an ISO date-time as local time when it has no zone', () => {
    const parsed = parseWhen('2026-11-02T09:30', now);

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(10);
    expect(parsed?.getDate()).toBe(2);
    expect(parsed?.getHours()).toBe(9);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it('honours an explicit zone', () => {
    expect(parseWhen('2026-11-02T09:30:00Z', now)?.toISOString()).toBe('2026-11-02T09:30:00.000Z');
  });

  it('uses 09:00 local for a date without a time', () => {
    const parsed = parseWhen('2026-11-02', now);

    expect(parsed?.getDate()).toBe(2);
    expect(parsed?.getHours()).toBe(9);
  });

  it('moves a wall-clock time to the next day when it has passed', () => {
    expect(parseWhen('09:00', now)?.getDate()).toBe(2);
    expect(parseWhen('18:00', now)?.getDate()).toBe(1);
  });

  it('adds relative offsets', () => {
    expect(parseWhen('15m', now)?.getTime()).toBe(now.getTime() + 15 * 60_000);
    expect(parseWhen('in 2h', now)?.getTime()).toBe(now.getTime() + 2 * 3_600_000);
    expect(parseWhen('+3 days', now)?.getTime()).toBe(now.getTime() + 3 * 86_400_000);
  });

  it('rejects text it cannot read', () => {
    expect(parseWhen('sometime later', now)).toBeUndefined();
    expect(parseWhen('25:00', now)).toBeUndefined();
    expect(parseWhen('2026-13-02T09:00', now)).toBeUndefined();
    expect(parseWhen('', now)).toBeUndefined();
  });
});

describe('formatRelative', () => {
  it('describes the distance in the unit that fits', () => {
    expect(formatRelative(new Date(now.getTime() + 30_000), now, 'en')).toBe('in 30 sec.');
    expect(formatRelative(new Date(now.getTime() + 20 * 60_000), now, 'en')).toBe('in 20 min.');
    expect(formatRelative(new Date(now.getTime() + 3 * 3_600_000), now, 'en')).toBe('in 3 hr.');
  });
});

describe('formatAbsolute', () => {
  it('formats the due date for the locale', () => {
    expect(formatAbsolute('2026-11-02T09:30:00', 'en')).toContain('2026');
  });
});
