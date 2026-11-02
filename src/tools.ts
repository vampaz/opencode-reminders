import type { Plugin } from '@opencode/plugin';

import { makeReminder, pendingReminders } from './reminder';
import { parseWhen } from './time';
import type { ReminderStore } from './store';

type ToolDomain = Plugin.Context['tool'];
type ToolEditor = Parameters<Parameters<ToolDomain['transform']>[0]>[0];
type ToolInfo = Parameters<ToolEditor['add']>[0];

export interface ToolDeps {
  readonly store: ReminderStore;
  readonly now: () => Date;
}

interface CreateInput {
  readonly title: string;
  readonly when: string;
  readonly message?: string;
  readonly prompt?: boolean;
  readonly prompt_text?: string;
}

/** The three tools the agent calls to manage reminders. */
export function createReminderTools(deps: ToolDeps): ToolInfo[] {
  const createTool: ToolInfo = {
    name: 'reminder_create',
    description:
      'Set a reminder. `when` must be an ISO 8601 date-time such as 2026-11-02T09:00, converted from what the user said. Set `prompt` to true to have the agent act on the reminder in this session when it is due.',
    input: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What to be reminded about.' },
        when: {
          type: 'string',
          description: 'ISO 8601 date-time in local time, for example 2026-11-02T09:00.',
        },
        message: { type: 'string', description: 'Optional detail shown with the reminder.' },
        prompt: {
          type: 'boolean',
          description: 'When true, the agent continues in this session at the due time.',
        },
        prompt_text: {
          type: 'string',
          description: 'Text to send to the agent at the due time. Defaults to the reminder title.',
        },
      },
      required: ['title', 'when'],
      additionalProperties: false,
    },
    execute: async (input, context) => {
      const data = input as CreateInput;
      const title = data.title?.trim();
      if (!title) throw new Error('A reminder needs a non-empty title.');

      const dueAt = parseWhen(data.when, deps.now());
      if (!dueAt) {
        throw new Error(
          `Invalid date-time: ${data.when}. Use ISO 8601, for example 2026-11-02T09:00.`,
        );
      }
      if (dueAt.getTime() <= deps.now().getTime()) {
        throw new Error(`${data.when} is in the past. Pick a future date-time.`);
      }

      const reminder = makeReminder(
        {
          title,
          dueAt,
          ...(data.message ? { message: data.message } : {}),
          ...(data.prompt
            ? {
                prompt: {
                  sessionID: context.sessionID,
                  text: data.prompt_text?.trim() || title,
                },
              }
            : {}),
        },
        deps.now(),
      );

      await deps.store.put(reminder);

      return {
        content: `Reminder ${reminder.id} set for ${reminder.dueAt}${data.prompt ? ' and the agent will continue in this session at that time' : ''}.`,
      };
    },
  };

  const listTool: ToolInfo = {
    name: 'reminder_list',
    description: 'List the reminders that are still pending, with their ids and due times.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => {
      const pending = pendingReminders(await deps.store.list());

      if (pending.length === 0) return { content: 'No pending reminders.' };

      return {
        content: pending
          .map(
            (reminder) =>
              `- ${reminder.id} — ${reminder.title} at ${reminder.dueAt}${reminder.prompt ? ' (prompts a session when due)' : ''}`,
          )
          .join('\n'),
      };
    },
  };

  const cancelTool: ToolInfo = {
    name: 'reminder_cancel',
    description: 'Cancel a pending reminder by its id.',
    input: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The reminder id from reminder_list.' } },
      required: ['id'],
      additionalProperties: false,
    },
    execute: async (input) => {
      const { id } = input as { id: string };
      const cancelled = await deps.store.cancel(id, deps.now());
      if (!cancelled) return { content: `No pending reminder with id ${id}.` };
      return { content: `Cancelled reminder ${cancelled.id} (${cancelled.title}).` };
    },
  };

  return [createTool, listTool, cancelTool];
}
