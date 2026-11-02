import { describe, expect, it, vi } from 'vitest';

import { MemoryStorage } from './memory-storage.helper';
import { makeReminder, type Reminder } from './reminder';
import { createScheduler } from './scheduler';
import { createReminderStore } from './store';

function due(minutesFromNow: number): Reminder {
  const dueAt = new Date(Date.UTC(2026, 10, 1, 12, 0));
  dueAt.setUTCMinutes(dueAt.getUTCMinutes() + minutesFromNow);
  return makeReminder(
    { title: `Reminder ${minutesFromNow}`, dueAt },
    new Date('2026-11-01T11:00:00.000Z'),
  );
}

describe('createScheduler', () => {
  it('claims a due reminder once and hands it to onFire', async () => {
    const store = createReminderStore(new MemoryStorage());
    const reminder = due(0);
    await store.put(reminder);

    const onFire = vi.fn(async (_reminder: Reminder) => {});
    const scheduler = createScheduler({
      store,
      now: () => new Date('2026-11-01T12:00:05.000Z'),
      onFire,
    });

    await scheduler.tick();
    await scheduler.tick();

    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire.mock.calls[0]?.[0]).toMatchObject({ id: reminder.id, title: reminder.title });
    expect((await store.get(reminder.id))?.firedAt).toBe('2026-11-01T12:00:05.000Z');
  });

  it('leaves future reminders alone', async () => {
    const store = createReminderStore(new MemoryStorage());
    await store.put(due(30));

    const onFire = vi.fn(async () => {});
    const scheduler = createScheduler({
      store,
      now: () => new Date('2026-11-01T12:00:00.000Z'),
      onFire,
    });

    await scheduler.tick();

    expect(onFire).not.toHaveBeenCalled();
  });

  it('runs the sweep with every listed reminder', async () => {
    const store = createReminderStore(new MemoryStorage());
    const future = due(30);
    await store.put(future);

    const onSweep = vi.fn(async (_reminders: readonly Reminder[]) => {});
    const scheduler = createScheduler({
      store,
      now: () => new Date('2026-11-01T12:00:00.000Z'),
      onFire: vi.fn(),
      onSweep,
    });

    await scheduler.tick();

    expect(onSweep).toHaveBeenCalledTimes(1);
    expect(onSweep.mock.calls[0]?.[0]?.map((item) => item.id)).toEqual([future.id]);
  });

  it('keeps delivering after one failure', async () => {
    const store = createReminderStore(new MemoryStorage());
    await store.put(due(-2));
    await store.put(due(-1));

    const onFire = vi.fn(async (reminder: Reminder) => {
      if (reminder.title === 'Reminder -2') throw new Error('boom');
    });

    const scheduler = createScheduler({
      store,
      now: () => new Date('2026-11-01T12:00:00.000Z'),
      onFire,
    });
    await scheduler.tick();

    expect(onFire).toHaveBeenCalledTimes(2);
  });
});
