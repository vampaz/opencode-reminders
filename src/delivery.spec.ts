import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Reminder } from './reminder';

import {
  appleScriptString,
  awaitingFallback,
  notificationScript,
  notifyWithOsascript,
} from './delivery';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('appleScriptString', () => {
  it('quotes a plain value', () => {
    expect(appleScriptString('Stand up')).toBe('"Stand up"');
  });

  it('escapes quotes and backslashes', () => {
    expect(appleScriptString('say "hi" at C:\\temp')).toBe('"say \\"hi\\" at C:\\\\temp"');
  });

  it('flattens newlines', () => {
    expect(appleScriptString('line one\nline two')).toBe('"line one line two"');
  });
});

describe('notificationScript', () => {
  it('builds a display notification command', () => {
    expect(notificationScript('Deploy', 'Check the logs')).toBe(
      'display notification "Check the logs" with title "Deploy"',
    );
  });

  it('omits a missing message without breaking the script', () => {
    expect(notificationScript('Deploy')).toBe('display notification "" with title "Deploy"');
  });
});

describe('notifyWithOsascript', () => {
  it('runs osascript with the script', async () => {
    const exec = vi.fn(async () => 'ok');

    expect(await notifyWithOsascript(exec, 'Deploy', 'Check the logs')).toBe(true);
    expect(exec).toHaveBeenCalledWith('/usr/bin/osascript', [
      '-e',
      'display notification "Check the logs" with title "Deploy"',
    ]);
  });

  it('reports failure instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exec = vi.fn(async () => {
      throw new Error('no osascript');
    });

    expect(await notifyWithOsascript(exec, 'Deploy')).toBe(false);
  });
});

describe('awaitingFallback', () => {
  const now = new Date('2026-11-01T12:02:00.000Z');

  function fired(overrides: Partial<Reminder> = {}): Reminder {
    return {
      id: 'r1',
      title: 'Deploy',
      dueAt: '2026-11-01T12:00:00.000Z',
      createdAt: '2026-11-01T11:00:00.000Z',
      firedAt: '2026-11-01T12:00:00.000Z',
      ...overrides,
    };
  }

  it('picks reminders past the grace period that no window acknowledged', () => {
    expect(awaitingFallback([fired()], now, 60_000).map((item) => item.id)).toEqual(['r1']);
  });

  it('skips ones inside the grace period, acknowledged, or cancelled', () => {
    expect(awaitingFallback([fired({ firedAt: '2026-11-01T12:01:30.000Z' })], now, 60_000)).toEqual(
      [],
    );
    expect(
      awaitingFallback([fired({ deliveredAt: '2026-11-01T12:00:10.000Z' })], now, 60_000),
    ).toEqual([]);
    expect(
      awaitingFallback([fired({ cancelledAt: '2026-11-01T12:00:10.000Z' })], now, 60_000),
    ).toEqual([]);
    expect(awaitingFallback([fired({ firedAt: undefined })], now, 60_000)).toEqual([]);
  });
});
