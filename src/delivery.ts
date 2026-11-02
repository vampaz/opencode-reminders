/**
 * The headless delivery path: a macOS notification for reminders that no
 * OpenCode desktop window picked up. Node only; the GUI bundle never imports it.
 */

import type { Reminder } from './reminder';

export type ExecFile = (file: string, args: readonly string[]) => Promise<unknown>;

/** Reminders that fired but no window acknowledged within the grace period. */
export function awaitingFallback(
  reminders: readonly Reminder[],
  now: Date,
  graceMs: number,
): Reminder[] {
  return reminders.filter((reminder) => {
    if (!reminder.firedAt || reminder.deliveredAt || reminder.cancelledAt) return false;
    return now.getTime() - Date.parse(reminder.firedAt) >= graceMs;
  });
}

/** Escapes a value for an AppleScript string literal. */
export function appleScriptString(value: string): string {
  const flattened = value.replace(/\s+/g, ' ').trim();
  return `"${flattened.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function notificationScript(title: string, message?: string): string {
  return `display notification ${appleScriptString(message ?? '')} with title ${appleScriptString(title)}`;
}

export async function notifyWithOsascript(
  exec: ExecFile,
  title: string,
  message?: string,
): Promise<boolean> {
  try {
    await exec('/usr/bin/osascript', ['-e', notificationScript(title, message)]);
    return true;
  } catch (error) {
    console.error('[reminders] osascript notification failed', error);
    return false;
  }
}
