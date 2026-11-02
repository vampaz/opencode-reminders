import { describe, expect, it } from 'vitest';

import {
  awaitingDelivery,
  dueReminders,
  history,
  isPending,
  makeReminder,
  nextReminder,
  pendingReminders,
  type Reminder,
} from './reminder';

const now = new Date('2026-11-01T12:00:00.000Z');

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    title: 'Water the plants',
    dueAt: '2026-11-01T13:00:00.000Z',
    createdAt: '2026-11-01T11:00:00.000Z',
    ...overrides,
  };
}

describe('makeReminder', () => {
  it('stores ISO timestamps and trims the title', () => {
    const created = makeReminder(
      { title: '  Call Ana  ', dueAt: new Date('2026-11-01T15:30:00.000Z') },
      now,
    );

    expect(created.title).toBe('Call Ana');
    expect(created.dueAt).toBe('2026-11-01T15:30:00.000Z');
    expect(created.createdAt).toBe(now.toISOString());
    expect(created.id).not.toBe('');
  });

  it('keeps an optional message and prompt', () => {
    const created = makeReminder(
      {
        title: 'Deploy',
        dueAt: new Date('2026-11-01T15:30:00.000Z'),
        message: 'Check the logs',
        prompt: { sessionID: 'ses_1', text: 'Run the deploy check' },
      },
      now,
    );

    expect(created.message).toBe('Check the logs');
    expect(created.prompt).toEqual({ sessionID: 'ses_1', text: 'Run the deploy check' });
  });
});

describe('dueReminders', () => {
  it('returns only pending reminders that are due, sorted by due time', () => {
    const later = reminder({ id: 'late', dueAt: '2026-11-01T11:55:00.000Z' });
    const earlier = reminder({ id: 'early', dueAt: '2026-11-01T11:30:00.000Z' });
    const future = reminder({ id: 'future', dueAt: '2026-11-01T14:00:00.000Z' });
    const fired = reminder({
      id: 'fired',
      dueAt: '2026-11-01T11:00:00.000Z',
      firedAt: '2026-11-01T11:00:01.000Z',
    });
    const cancelled = reminder({
      id: 'cancelled',
      dueAt: '2026-11-01T11:00:00.000Z',
      cancelledAt: '2026-11-01T11:00:01.000Z',
    });

    expect(
      dueReminders([later, earlier, future, fired, cancelled], now).map((item) => item.id),
    ).toEqual(['early', 'late']);
  });
});

describe('pendingReminders', () => {
  it('keeps a reminder pending until it fires, even when overdue', () => {
    const overdue = reminder({ dueAt: '2026-11-01T00:00:00.000Z' });

    expect(isPending(overdue)).toBe(true);
    expect(pendingReminders([overdue])).toHaveLength(1);
  });
});

describe('nextReminder', () => {
  it('skips reminders that are already due', () => {
    const overdue = reminder({ id: 'overdue', dueAt: '2026-11-01T11:00:00.000Z' });
    const upcoming = reminder({ id: 'upcoming', dueAt: '2026-11-01T18:00:00.000Z' });

    expect(nextReminder([overdue, upcoming], now)?.id).toBe('upcoming');
    expect(nextReminder([overdue], now)).toBeUndefined();
  });
});

describe('awaitingDelivery', () => {
  it('lists fired reminders no window has handled', () => {
    const pendingDelivery = reminder({ id: 'a', firedAt: '2026-11-01T12:00:01.000Z' });
    const delivered = reminder({
      id: 'b',
      firedAt: '2026-11-01T12:00:01.000Z',
      deliveredAt: '2026-11-01T12:00:02.000Z',
    });

    expect(awaitingDelivery([pendingDelivery, delivered]).map((item) => item.id)).toEqual(['a']);
  });
});

describe('history', () => {
  it('lists finished reminders newest first', () => {
    const older = reminder({
      id: 'older',
      dueAt: '2026-11-01T09:00:00.000Z',
      firedAt: '2026-11-01T09:00:30.000Z',
      deliveredAt: '2026-11-01T09:01:00.000Z',
    });
    const newer = reminder({
      id: 'newer',
      dueAt: '2026-11-01T10:00:00.000Z',
      cancelledAt: '2026-11-01T10:01:00.000Z',
    });
    const pending = reminder({ id: 'pending' });

    expect(history([older, newer, pending]).map((item) => item.id)).toEqual(['newer', 'older']);
  });
});
