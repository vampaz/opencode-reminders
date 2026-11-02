import { Schema } from 'effect';
import { Plugin, Store } from '@opencode/plugin/gui';

const prefs = Schema.Struct({
  sound: Schema.Boolean,
});

export const definition = Plugin.define({
  os: ['macos'],
  stores: {
    prefs: Store.global(prefs, { sound: true }),
  },
  i18n: {
    en: {
      'panel.title': 'Reminders',
      'panel.empty': 'No reminders yet. Add one below, or ask the agent.',
      'panel.pending': 'Upcoming',
      'panel.past': 'Past',
      'panel.what': 'What',
      'panel.when': 'When',
      'panel.whenHint': '2026-11-02T09:00 or 15m',
      'panel.remindMe': 'Remind me',
      'panel.remindAgent': 'Remind the agent',
      'panel.modeHint':
        'Remind me notifies you. Remind the agent continues this session when the reminder is due.',
      'panel.cancel': 'Cancel reminder',
      'panel.delete': 'Delete reminder',
      'panel.modeAgent': 'Agent',
      'panel.modeNotify': 'Notify only',
      'panel.askAgent': 'Ask the agent when due',
      'panel.stopAgent': 'Notify only when due',
      'panel.createFailed': 'Could not add the reminder.',
      'panel.invalidWhen': 'Could not read that time.',
      'command.open': 'Open reminders',
      'command.noSession': 'Open a session to see reminders.',
      'command.remind': 'Remind me',
      'command.remindDescription': 'Create a reminder from a time and a title',
      'settings.title': 'Reminders',
      'settings.sound': 'Play a sound with reminders',
      'settings.fallback': 'Notify without an OpenCode window',
      'settings.fallbackHint':
        'Sends a macOS notification when no desktop window picks the reminder up within a minute.',
      'settings.notificationNote':
        'System notifications follow Settings › Notifications. Desktop notifications are off by default there.',
      'settings.open': 'Open the reminders panel',
      'pill.next': 'Next: {{title}}',
      'toast.created': 'Reminder set for {{when}}.',
      'toast.failed': 'The reminder action failed.',
    },
  },
});
