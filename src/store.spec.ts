import { describe, expect, it } from 'vitest';

import { MemoryStorage } from './memory-storage.helper';
import { makeReminder, type Reminder } from './reminder';
import { createReminderStore } from './store';

function reminderAt(minutes: number, overrides: Partial<Reminder> = {}): Reminder {
  return {
    ...makeReminder(
      { title: `Reminder ${minutes}`, dueAt: new Date(Date.UTC(2026, 10, 1, 12, minutes)) },
      new Date(0),
    ),
    ...overrides,
  };
}

describe('createReminderStore', () => {
  it('lists reminders across pages in due order', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);

    for (const minutes of [3, 1, 2]) await store.put(reminderAt(minutes));

    expect((await store.list()).map((item) => item.title)).toEqual([
      'Reminder 1',
      'Reminder 2',
      'Reminder 3',
    ]);
  });

  it('pages through more reminders than one scan returns', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);

    for (let index = 0; index < 150; index += 1) await store.put(reminderAt(index % 60));

    expect(await store.list()).toHaveLength(150);
  });

  it('ignores stored values that are not reminders', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);

    await storage.set('reminders/broken', { title: 'no id' });
    await store.put(reminderAt(1));

    expect(await store.list()).toHaveLength(1);
  });

  it('fires a reminder only once', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);
    const reminder = reminderAt(1);
    await store.put(reminder);

    const first = await store.markFired(reminder.id, new Date('2026-11-01T12:01:00.000Z'));
    const second = await store.markFired(reminder.id, new Date('2026-11-01T12:02:00.000Z'));

    expect(first?.firedAt).toBe('2026-11-01T12:01:00.000Z');
    expect(second).toBeUndefined();
  });

  it('lets only one plugin instance fire a reminder', async () => {
    const storage = new MemoryStorage();
    const first = createReminderStore(storage);
    const second = createReminderStore(storage);
    const reminder = reminderAt(1);
    await first.put(reminder);

    const results = await Promise.all([
      first.markFired(reminder.id, new Date('2026-11-01T12:01:00.000Z')),
      second.markFired(reminder.id, new Date('2026-11-01T12:01:00.000Z')),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('marks a fired reminder delivered only once', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);
    const reminder = reminderAt(1);
    await store.put(reminder);
    await store.markFired(reminder.id, new Date('2026-11-01T12:01:00.000Z'));

    const delivered = await store.markDelivered(reminder.id, new Date('2026-11-01T12:01:01.000Z'));
    const again = await store.markDelivered(reminder.id, new Date('2026-11-01T12:01:02.000Z'));

    expect(delivered?.deliveredAt).toBe('2026-11-01T12:01:01.000Z');
    expect(again).toBeUndefined();
  });

  it('does not deliver a reminder that never fired', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);
    const reminder = reminderAt(1);
    await store.put(reminder);

    expect(await store.markDelivered(reminder.id, new Date())).toBeUndefined();
  });

  it('cancels only a pending reminder', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);
    const pending = reminderAt(1);
    const fired = reminderAt(2, { firedAt: '2026-11-01T12:02:00.000Z' });
    await store.put(pending);
    await store.put(fired);

    expect(
      (await store.cancel(pending.id, new Date('2026-11-01T11:00:00.000Z')))?.cancelledAt,
    ).toBe('2026-11-01T11:00:00.000Z');
    expect(await store.cancel(fired.id, new Date())).toBeUndefined();
  });

  it('turns the agent follow-up on and off per reminder', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);
    const reminder = reminderAt(1);
    await store.put(reminder);

    const enabled = await store.setPrompt(reminder.id, {
      sessionID: 'ses_1',
      text: 'Check the logs',
    });
    const disabled = await store.setPrompt(reminder.id, undefined);

    expect(enabled?.prompt).toEqual({ sessionID: 'ses_1', text: 'Check the logs' });
    expect(disabled?.prompt).toBeUndefined();
  });

  it('leaves the agent follow-up alone once a reminder fired', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);
    const reminder = reminderAt(1);
    await store.put(reminder);
    await store.markFired(reminder.id, new Date('2026-11-01T12:01:00.000Z'));

    expect(
      await store.setPrompt(reminder.id, { sessionID: 'ses_1', text: 'late' }),
    ).toBeUndefined();
  });

  it('removes a reminder', async () => {
    const storage = new MemoryStorage();
    const store = createReminderStore(storage);
    const reminder = reminderAt(1);
    await store.put(reminder);

    await store.remove(reminder.id);

    expect(await store.get(reminder.id)).toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });
});
