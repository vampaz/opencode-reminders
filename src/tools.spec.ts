import { describe, expect, it } from 'vitest';

import { MemoryStorage } from './memory-storage.helper';
import { createReminderStore } from './store';
import { createReminderTools } from './tools';

const now = new Date(2026, 10, 1, 12, 0, 0);

type LooseTool = {
  execute(input: unknown, context: { sessionID: string }): Promise<{ content?: string }>;
};

function setup() {
  const store = createReminderStore(new MemoryStorage());
  const tools = createReminderTools({ store, now: () => new Date(now) });

  function run(
    name: string,
    input: unknown,
    sessionID = 'ses_test',
  ): Promise<{ content?: string }> {
    const tool = tools.find((candidate) => candidate.name === name) as unknown as LooseTool;
    if (!tool) throw new Error(`Missing tool ${name}`);
    return tool.execute(input, { sessionID });
  }

  return { store, run, tools };
}

describe('reminder_create', () => {
  it('stores a reminder from an ISO date-time', async () => {
    const { run, store } = setup();

    const result = await run('reminder_create', { title: 'Dentist', when: '2026-11-02T09:00' });
    const [stored] = await store.list();

    expect(result.content).toContain('2026-11-02T09:00');
    expect(stored?.title).toBe('Dentist');
    expect(stored?.prompt).toBeUndefined();
  });

  it('records the creating session when the agent should continue', async () => {
    const { run, store } = setup();

    await run('reminder_create', { title: 'Deploy', when: '2h', prompt: true }, 'ses_abc');
    const [stored] = await store.list();

    expect(stored?.prompt).toEqual({ sessionID: 'ses_abc', text: 'Deploy' });
  });

  it('accepts prompt text', async () => {
    const { run, store } = setup();

    await run('reminder_create', {
      title: 'Deploy',
      when: '2h',
      prompt: true,
      prompt_text: 'Check the deploy',
    });
    const [stored] = await store.list();

    expect(stored?.prompt?.text).toBe('Check the deploy');
  });

  it('rejects an unreadable time', async () => {
    const { run } = setup();

    await expect(
      run('reminder_create', { title: 'Dentist', when: 'next tuesday' }),
    ).rejects.toThrow(/Invalid date-time/);
  });

  it('rejects a time in the past', async () => {
    const { run } = setup();

    await expect(
      run('reminder_create', { title: 'Dentist', when: '2026-10-01T09:00' }),
    ).rejects.toThrow(/in the past/);
  });

  it('rejects an empty title', async () => {
    const { run } = setup();

    await expect(run('reminder_create', { title: '   ', when: '2h' })).rejects.toThrow(/title/);
  });
});

describe('reminder_list', () => {
  it('reports when nothing is pending', async () => {
    const { run } = setup();

    await expect(run('reminder_list', {})).resolves.toEqual({ content: 'No pending reminders.' });
  });

  it('lists pending reminders with their ids', async () => {
    const { run, store } = setup();
    await run('reminder_create', { title: 'Dentist', when: '2h' });
    const [stored] = await store.list();

    const result = await run('reminder_list', {});

    expect(result.content).toContain(stored?.id);
    expect(result.content).toContain('Dentist');
  });
});

describe('reminder_cancel', () => {
  it('cancels a pending reminder', async () => {
    const { run, store } = setup();
    await run('reminder_create', { title: 'Dentist', when: '2h' });
    const [stored] = await store.list();

    const result = await run('reminder_cancel', { id: stored?.id });

    expect(result.content).toContain('Cancelled');
    expect((await store.get(stored!.id))?.cancelledAt).toBeDefined();
  });

  it('reports an unknown id', async () => {
    const { run } = setup();

    await expect(run('reminder_cancel', { id: 'missing' })).resolves.toEqual({
      content: 'No pending reminder with id missing.',
    });
  });
});
