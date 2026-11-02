import type { SetupContext } from '@opencode/plugin/gui';
import type { Accessor } from 'solid-js';

import type { Reminder } from '../reminder';
import type { definition } from './definition';

export type UiContext = SetupContext<typeof definition>;

export interface ReminderUi {
  readonly ctx: UiContext;
  readonly reminders: Accessor<Reminder[]>;
  readonly settings: Accessor<{ fallback: boolean }>;
  create(input: {
    title: string;
    when: string;
    prompt?: { sessionID: string; text: string };
  }): Promise<boolean>;
  cancel(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  setPrompt(id: string, enabled: boolean): Promise<void>;
  configure(fallback: boolean): Promise<void>;
  open(): void;
}
