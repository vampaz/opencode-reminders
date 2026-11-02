import { execFile } from 'node:child_process';

import { Plugin } from '@opencode/plugin';

import { awaitingFallback, notifyWithOsascript, type ExecFile } from './src/delivery';
import { makeReminder } from './src/reminder';
import { Reminders } from './src/rpc';
import { createScheduler } from './src/scheduler';
import { createReminderStore, type ReminderStorage } from './src/store';
import { createReminderTools } from './src/tools';
import { parseWhen } from './src/time';

const SETTINGS_KEY = 'settings';
const DELIVERY_GRACE_MS = 60_000;

interface Settings {
  fallback: boolean;
}

const runFile: ExecFile = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: 10_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });

export default Plugin.define({
  id: 'reminders',
  async setup(ctx) {
    const store = createReminderStore(ctx.storage as ReminderStorage);
    const now = () => new Date();
    let settings: Settings = { fallback: true };

    async function saveSettings(next: Settings): Promise<void> {
      settings = next;
      await ctx.storage.set(SETTINGS_KEY, next as unknown as Parameters<typeof ctx.storage.set>[1]);
    }

    /** Reads the toggle again, so a change applies to every loaded plugin instance. */
    async function fallbackEnabled(): Promise<boolean> {
      const current = await ctx.storage.get(SETTINGS_KEY);
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        const value = (current as Record<string, unknown>).fallback;
        if (typeof value === 'boolean') {
          settings = { fallback: value };
          return value;
        }
      }
      return settings.fallback;
    }

    await fallbackEnabled();

    const rpc = await ctx.rpc.register(Reminders, {
      list: async () => store.list(),

      pending: async () => {
        const reminders = await store.list();
        return reminders.filter((reminder) => reminder.firedAt && !reminder.deliveredAt);
      },

      create: async (input, context) => {
        const data = input as {
          title?: string;
          when?: string;
          message?: string;
          prompt?: { sessionID: string; text: string };
        };

        const title = data.title?.trim();
        if (!title) return context.error('empty_title', 'A reminder needs a non-empty title.', {});

        const dueAt = data.when ? parseWhen(data.when, now()) : undefined;
        if (!dueAt) {
          return context.error(
            'invalid_when',
            `Invalid date-time: ${data.when ?? '(missing)'}.`,
            {},
          );
        }

        const reminder = makeReminder(
          {
            title,
            dueAt,
            ...(data.message ? { message: data.message } : {}),
            ...(data.prompt ? { prompt: data.prompt } : {}),
          },
          now(),
        );
        await store.put(reminder);
        return reminder;
      },

      cancel: async (input) => {
        const { id } = input as { id: string };
        await store.cancel(id, now());
        return null;
      },

      remove: async (input) => {
        const { id } = input as { id: string };
        await store.remove(id);
        return null;
      },

      ack: async (input) => {
        const { id } = input as { id: string };
        await store.markDelivered(id, now());
        return null;
      },

      settings: async () => ({ fallback: await fallbackEnabled() }),

      configure: async (input) => {
        const { fallback } = input as { fallback: boolean };
        await saveSettings({ fallback });
        return null;
      },
    });

    const scheduler = createScheduler({
      store,
      now,
      onFire: async (reminder) => {
        await rpc.events.emit('fired', { id: reminder.id, title: reminder.title });

        if (reminder.prompt) {
          try {
            await ctx.session.prompt({
              sessionID: reminder.prompt.sessionID,
              text: reminder.prompt.text,
            });
          } catch (error) {
            console.error('[reminders] could not prompt session', reminder.prompt.sessionID, error);
          }
        }
      },
      onSweep: async (reminders) => {
        if (!(await fallbackEnabled())) return;
        for (const reminder of awaitingFallback(reminders, now(), DELIVERY_GRACE_MS)) {
          await notifyWithOsascript(runFile, reminder.title, reminder.message);
          await store.markDelivered(reminder.id, now());
        }
      },
    });

    await ctx.tool.transform((editor) => {
      for (const tool of createReminderTools({ store, now })) editor.add(tool);
    });

    scheduler.start();

    return () => scheduler.stop();
  },
});
