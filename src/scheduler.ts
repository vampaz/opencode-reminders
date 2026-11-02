import { dueReminders, type Reminder } from './reminder';
import type { ReminderStore } from './store';

export interface SchedulerOptions {
  readonly store: ReminderStore;
  readonly now: () => Date;
  readonly onFire: (reminder: Reminder) => Promise<void> | void;
  /** Runs on every tick with the reminders that were listed, for time-based follow-up. */
  readonly onSweep?: (reminders: readonly Reminder[]) => Promise<void> | void;
  readonly tickMs?: number;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
}

/**
 * Claims due reminders and hands them to `onFire` once. State lives in the store,
 * so a restart re-arms from what is persisted, and an overdue reminder fires on
 * the first tick instead of being lost.
 */
export function createScheduler(options: SchedulerOptions): Scheduler {
  const tickMs = options.tickMs ?? 30_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const reminders = await options.store.list();
      const due = dueReminders(reminders, options.now());
      for (const reminder of due) {
        const fired = await options.store.markFired(reminder.id, options.now());
        if (!fired) continue;
        try {
          await options.onFire(fired);
        } catch (error) {
          console.error('[reminders] delivery failed', error);
        }
      }
      await options.onSweep?.(reminders);
    } catch (error) {
      console.error('[reminders] scheduler tick failed', error);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), tickMs);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
    tick,
  };
}
