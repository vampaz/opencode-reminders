/**
 * Reminder records and the pure rules that read them. Shared by the server part,
 * the desktop GUI, and the tests, so this module must stay free of Node and
 * Solid imports.
 */

export interface ReminderPrompt {
  readonly sessionID: string;
  readonly text: string;
}

export interface Reminder {
  readonly id: string;
  readonly title: string;
  readonly message?: string;
  /** ISO 8601 timestamp. */
  readonly dueAt: string;
  /** ISO 8601 timestamp. */
  readonly createdAt: string;
  readonly firedAt?: string;
  /** Set once a desktop window showed or suppressed the notification. */
  readonly deliveredAt?: string;
  readonly cancelledAt?: string;
  readonly prompt?: ReminderPrompt;
}

export interface NewReminder {
  readonly title: string;
  readonly dueAt: Date;
  readonly message?: string;
  readonly prompt?: ReminderPrompt;
}

export function makeReminder(input: NewReminder, now: Date): Reminder {
  return {
    id: globalThis.crypto.randomUUID(),
    title: input.title.trim(),
    ...(input.message ? { message: input.message } : {}),
    dueAt: input.dueAt.toISOString(),
    createdAt: now.toISOString(),
    ...(input.prompt ? { prompt: input.prompt } : {}),
  };
}

export function isPending(reminder: Reminder): boolean {
  return !reminder.cancelledAt && !reminder.firedAt;
}

export function isDue(reminder: Reminder, now: Date): boolean {
  return isPending(reminder) && Date.parse(reminder.dueAt) <= now.getTime();
}

export function dueReminders(reminders: readonly Reminder[], now: Date): Reminder[] {
  return reminders.filter((reminder) => isDue(reminder, now)).sort(byDueAt);
}

export function pendingReminders(reminders: readonly Reminder[]): Reminder[] {
  return reminders.filter(isPending).sort(byDueAt);
}

export function nextReminder(reminders: readonly Reminder[], now: Date): Reminder | undefined {
  return pendingReminders(reminders).find((reminder) => Date.parse(reminder.dueAt) > now.getTime());
}

/** Fired reminders no window has handled yet, oldest first. */
export function awaitingDelivery(reminders: readonly Reminder[]): Reminder[] {
  return reminders.filter((reminder) => reminder.firedAt && !reminder.deliveredAt).sort(byDueAt);
}

export function byDueAt(left: Reminder, right: Reminder): number {
  return Date.parse(left.dueAt) - Date.parse(right.dueAt);
}

/** Newest first, for the history part of the panel. */
export function history(reminders: readonly Reminder[]): Reminder[] {
  return reminders
    .filter((reminder) => !isPending(reminder))
    .sort((left, right) => Date.parse(right.dueAt) - Date.parse(left.dueAt));
}
