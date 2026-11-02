# OpenCode 2 Plugin: Reminders

An [OpenCode 2](https://opencode.ai/v2/docs/) plugin that turns reminders into a desktop feature:
a side panel, a command, a titlebar pill, a settings page, and native notifications that click through
to the session that set them.

## Features

- **Agent tools**: `reminder_create`, `reminder_list`, and `reminder_cancel`
- **Agent follow-up**: a reminder can prompt the creating session when it is due, so the agent
  continues the task instead of only notifying
- **Side panel**: upcoming and past reminders, with inline creation, cancel, and delete actions
- **Palette and slash commands**: `Open reminders` (`mod+shift+r`) and `/remind 15m take a break`
- **Titlebar pill**: shows when the next reminder is due
- **Native notification**: uses the app's own notification path, so it follows
  `Settings › Notifications` and opens the session when clicked
- **Headless fallback**: a macOS notification through `osascript` when no desktop window picks the
  reminder up within a minute, so reminders still fire from the TUI or with the app closed
- **Durable**: reminders live in plugin storage and survive restarts; overdue reminders fire on the
  next tick instead of being lost

## Requirements

- OpenCode 2.2.5 or newer, with the desktop app for the GUI part
- macOS, because the fallback uses `osascript`
- Node 22 or newer to build

## Install

Build the plugin once. The GUI part is not committed: OpenCode loads a CommonJS bundle from
`dist/gui-experimental.cjs`.

```sh
npm install
npm run build:gui
```

Then load the directory by path from the global configuration. OpenCode reloads configuration
without a restart.

```jsonc
{
  "plugins": ["<path-to-this-checkout>"],
}
```

Open the panel from the side region's `+` menu, or press `Cmd+Shift+R` in a session.

## Tools

| Tool              | Input                                                  | Purpose                               |
| ----------------- | ------------------------------------------------------ | ------------------------------------- |
| `reminder_create` | `title`, `when`, `message?`, `prompt?`, `prompt_text?` | Set a reminder                        |
| `reminder_list`   | none                                                   | List pending reminders with their ids |
| `reminder_cancel` | `id`                                                   | Cancel a pending reminder             |

`when` is an ISO 8601 date-time in local time, for example `2026-11-02T09:00`. The panel and the
`/remind` command also accept relative offsets (`15m`, `2h`, `3d`), a wall-clock time (`09:00`), a
date (`2026-11-02`), and full ISO timestamps with a zone.

Set `prompt: true` to have the agent continue in the session that created the reminder. The same
option stores `prompt_text`, which defaults to the title.

## Delivery

1. The server ticks every 30 seconds, claims due reminders in storage, and emits a `fired` event.
2. When the reminder has a prompt, the agent is prompted in that session.
3. A desktop window shows the notification through the app's attention API and acknowledges the
   reminder. The notification id is the reminder id, so only one window notifies. When a window has
   focus the system banner is suppressed, so the window shows the reminder as an in-app toast
   instead.
4. If no window acknowledges within a minute and the fallback is enabled, the server shows a macOS
   notification through `osascript`.

Desktop notifications are off by default in `Settings › Notifications`; the sound is on. macOS must
also allow notifications for OpenCode. The plugin cannot override those settings, and it
acknowledges a reminder even when the user turned notifications off, so the fallback does not notify
twice.

## Limits

- Reminders fire only while the OpenCode server runs. Delivery does not depend on the desktop app,
  but it does depend on the background service.
- The GUI plugin API is experimental (`./gui-experimental`) and may change between OpenCode releases.
- The `osascript` fallback is macOS only. The plugin declares `os: ["macos"]` for its GUI.

## Development

```sh
npm run lint      # oxlint
npm run format    # oxfmt --check
npm run typecheck # tsc --noEmit
npm test          # vitest
npm run dev:gui   # rebuild the GUI bundle on change
```

`src/reminder.ts`, `src/time.ts`, and `src/store.ts` hold the pure rules and the storage layer.
`index.ts` wires the server part; `src/gui.tsx` and `src/gui/` hold the desktop part.
