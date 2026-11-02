/**
 * Date parsing and formatting for reminders. Pure and shared, with no Node or
 * Solid imports, so the server tools and the desktop panel parse the same way.
 */

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const CLOCK = /^(\d{1,2}):(\d{2})$/;
const RELATIVE =
  /^(?:in\s+)?\+?(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i;

/**
 * Resolves what a user typed into a due date.
 *
 * Accepts an ISO 8601 date or date-time, `HH:mm` for the next occurrence of that
 * wall-clock time, and relative offsets such as `15m`, `2h`, or `in 3 days`.
 * A date without a time means 09:00 local time.
 */
export function parseWhen(input: string, now: Date): Date | undefined {
  const value = input.trim();
  if (!value) return undefined;

  const relative = RELATIVE.exec(value);
  if (relative) return new Date(now.getTime() + Number(relative[1]) * unitMs(relative[2]));

  const clock = CLOCK.exec(value);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    if (hours > 23 || minutes > 59) return undefined;
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  const iso = ISO_DATE.exec(value);
  if (iso) {
    const [, year, month, day, hours, minutes, seconds, zone] = iso;
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31)
      return undefined;
    if (hours !== undefined && (Number(hours) > 23 || Number(minutes) > 59)) return undefined;
    if (zone || hours === undefined) {
      const parsed = Date.parse(value);
      if (Number.isNaN(parsed)) return undefined;
      if (hours === undefined) {
        const local = new Date(Number(year), Number(month) - 1, Number(day), 9, 0, 0, 0);
        return local;
      }
      return new Date(parsed);
    }
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      seconds ? Number(seconds) : 0,
      0,
    );
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed);
}

function unitMs(unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith('m')) return 60_000;
  if (normalized.startsWith('h')) return 3_600_000;
  return 86_400_000;
}

export function formatRelative(dueAt: string | Date, now: Date, locale?: string): string {
  const due = typeof dueAt === 'string' ? Date.parse(dueAt) : dueAt.getTime();
  const deltaSeconds = Math.round((due - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });

  if (Math.abs(deltaSeconds) < 60) return formatter.format(deltaSeconds, 'second');
  const minutes = Math.round(deltaSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}

export function formatAbsolute(dueAt: string | Date, locale?: string): string {
  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(due);
}
