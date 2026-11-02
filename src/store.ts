import { byDueAt, isPending, type Reminder } from './reminder';

/** The slice of `ctx.storage` this plugin needs, so tests can pass a fake. */
export interface ReminderStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  scan(options: {
    prefix: string;
    after?: string;
    limit?: number;
  }): Promise<{ entries: readonly { key: string; value: unknown }[]; next?: string }>;
}

const PREFIX = 'reminders/';
const PAGE = 100;

/**
 * Reminder ids this process already fired. The server can load the plugin once per
 * location, so several instances share the same storage and must not fire the same
 * reminder twice.
 */
const claimed = new Set<string>();

export interface ReminderStore {
  list(): Promise<Reminder[]>;
  get(id: string): Promise<Reminder | undefined>;
  put(reminder: Reminder): Promise<void>;
  remove(id: string): Promise<void>;
  markFired(id: string, at: Date): Promise<Reminder | undefined>;
  markDelivered(id: string, at: Date): Promise<Reminder | undefined>;
  cancel(id: string, at: Date): Promise<Reminder | undefined>;
}

export function createReminderStore(storage: ReminderStorage): ReminderStore {
  async function get(id: string): Promise<Reminder | undefined> {
    const value = await storage.get(PREFIX + id);
    return isReminder(value) ? value : undefined;
  }

  async function write(reminder: Reminder): Promise<void> {
    await storage.set(PREFIX + reminder.id, reminder);
  }

  async function patch(
    id: string,
    mutate: (reminder: Reminder) => Reminder | undefined,
  ): Promise<Reminder | undefined> {
    const current = await get(id);
    if (!current) return undefined;
    const next = mutate(current);
    if (!next) return undefined;
    await write(next);
    return next;
  }

  return {
    async list() {
      const found: Reminder[] = [];
      let after: string | undefined;
      do {
        const page = await storage.scan({
          prefix: PREFIX,
          limit: PAGE,
          ...(after ? { after } : {}),
        });
        for (const entry of page.entries) {
          if (isReminder(entry.value)) found.push(entry.value);
        }
        after = page.next;
      } while (after);
      return found.sort(byDueAt);
    },

    get,

    put: write,

    async remove(id) {
      await storage.remove(PREFIX + id);
    },

    async markFired(id, at) {
      if (claimed.has(id)) return undefined;
      claimed.add(id);
      const current = await get(id);
      if (!current || !isPending(current)) return undefined;

      const next: Reminder = { ...current, firedAt: at.toISOString() };
      try {
        await write(next);
      } catch (error) {
        claimed.delete(id);
        throw error;
      }
      return next;
    },

    markDelivered(id, at) {
      return patch(id, (reminder) => {
        if (!reminder.firedAt || reminder.deliveredAt) return undefined;
        return { ...reminder, deliveredAt: at.toISOString() };
      });
    },

    cancel(id, at) {
      return patch(id, (reminder) => {
        if (!isPending(reminder)) return undefined;
        return { ...reminder, cancelledAt: at.toISOString() };
      });
    },
  };
}

function isReminder(value: unknown): value is Reminder {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.dueAt === 'string' &&
    typeof record.createdAt === 'string' &&
    !Number.isNaN(Date.parse(record.dueAt))
  );
}
