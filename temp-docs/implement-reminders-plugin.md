# Plan: OpenCode reminders plugin (desktop-grade)

Build a local OpenCode V2 plugin that turns reminders into a first-class desktop feature:
a side panel, a command, a titlebar pill, a settings page, and native notifications that
click through to a session.

- Package: `opencode-reminders`, plugin id `reminders`
- Location: this repository
- Loaded locally from `~/.config/opencode/opencode.jsonc` (no npm publish in scope)
- Reference conventions: oxlint, oxfmt, `tsc --noEmit`, vitest, `.spec.ts` beside source, Node >= 22
- Docs source of truth: <https://opencode.ai/v2/docs/build/plugins>,
  <https://opencode.ai/v2/docs/build/plugins/server>, <https://opencode.ai/v2/docs/build/plugins/gui>
- Target: latest OpenCode V2, meaning `@opencode/plugin@2.2.5` and the matching 2.2.5 app/CLI
  - OpenCode Desktop: `/Applications/OpenCode.app` reports 2.2.5 (matches the SDK)
  - `opencode` CLI on PATH reports 2.1.4; upgrade it before any runtime check
  - `@opencode/plugin@2.2.5` publishes `./gui`, `./gui/main`, `./gui/vite`, and `./rpc`, so the GUI
    part is available; the local clone `~/works/opencode` at 2.0.12 predates it and is not a reference
  - Pin `@opencode/plugin` to `^2.2.5`; keep other devDependencies at their latest versions

## Decisions to confirm before coding

- [ ] D1. Scope: reminders only, or also open a session and prompt the agent when a reminder fires?
      (Phase 6 is optional and off by default per reminder.)
- [ ] D2. Delivery: GUI `ctx.attention.notify` as primary, with an `osascript` fallback from the
      server part when no window acknowledges in 60s. This keeps the native look and still works
      with the TUI or a closed desktop app. Confirm before Phase 4.
- [x] D3. Local only. The package is loaded by path, never published. Publish steps stay out of the plan.

## Phase 0: Verify the platform before building

- [ ] Step 0.1: Align the CLI with the target version
  - Run `opencode upgrade` and confirm `opencode --version` reports `2.2.5` or newer.
  - Files: none (machine state)
  - Verify: `opencode --version` matches the Desktop app version and `@opencode/plugin@2.2.5`.
    If the CLI cannot match it, stop and report the version split.

- [ ] Step 0.2: Confirm the GUI part loads in the installed app
  - Build a throwaway plugin in `temp-docs/smoke/` with only a `gui-experimental` part
    that adds a `Command`. Point `~/.config/opencode/opencode.jsonc` at it.
  - Files: `temp-docs/smoke/package.json`, `temp-docs/smoke/src/gui.tsx`, `temp-docs/smoke/vite.config.ts`
  - Verify: `npm run build` then open OpenCode Desktop, press `Cmd+K`, and see the smoke command.
    Check `Settings > Extensions > Plugins` lists it as loaded. Remove the smoke entry afterwards.
  - If it does not load, stop and report: the installed app may not support the 2.2.5 GUI API.

- [ ] Step 0.3: Capture the real 2.2.5 SDK signatures
  - Install `@opencode/plugin@2.2.5` in a scratch directory and read `dist/gui/index.d.ts` (or the
    published package) to record the exact shapes for `Command`, `Panel`, `SettingsPage`,
    `TitlebarItem`, `Attention.notify`, and `Plugin.define`.
  - Files: `temp-docs/sdk-notes.md`
  - Verify: every API used in Phase 3 appears in the notes with its real signature.

## Phase 1: Scaffold the package

- [ ] Step 1.1: Create the package skeleton
  - Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `oxlint.json`, `.oxfmtrc.json`,
    `.gitignore`, `LICENSE`, `README.md`
  - Scripts: `lint`, `format`, `format:fix`, `typecheck`, `test`, `build:gui` (`vite build`),
    `dev:gui` (`vite build --watch`)
  - Dependencies: `@opencode/plugin@^2.2.5`; dev: `vite`, `vite-plugin-solid`, `solid-js`,
    `oxlint`, `oxfmt`, `typescript`, `vitest`, `@types/node` (latest released versions)
  - Exports: `.` -> `./index.ts`, `./rpc` -> `./src/rpc.ts`, `./gui-experimental` -> `./dist/gui-experimental.cjs`
  - Verify: `npm run lint`, `npm run typecheck`, `npm run test` all pass on the empty scaffold.

- [ ] Step 1.2: Add the GUI bundle entry so the build is real from day one
  - Files: `src/gui.tsx` (minimal `Plugin.define({ setup })` adding one command),
    `vite.config.ts` using `gui()` from `@opencode/plugin/gui/vite`
  - Verify: `npm run build:gui` emits one `dist/gui-experimental.cjs`; `node -e "require('./dist/gui-experimental.cjs')"` resolves.

## Phase 2: Server part (state, tools, schedule)

- [ ] Step 2.1: Define the reminder model and pure scheduling helpers
  - Files: `src/reminder.ts`, `src/reminder.spec.ts`
  - Shape: `{ id, title, message?, dueAt (ISO), createdAt, firedAt?, ackedAt?, status, prompt? }`
  - Helpers: `nextDue(reminders, now)`, `dueNow(reminders, now)`, `isOverdue(r, now)`, id generation
  - Verify: `npm run test -- src/reminder.spec.ts` covers due, overdue, fired, cancelled, and clock-skew cases.

- [ ] Step 2.2: Persist reminders in plugin storage
  - Files: `src/store.ts`, `src/store.spec.ts` (fake `ctx.storage`)
  - Keys: `reminders/<id>` per record, `reminders/index` for listing order
  - Verify: `npm run test -- src/store.spec.ts` covers create, list ordering, cancel, ack, and reload after restart.

- [ ] Step 2.3: Register the tools the model calls
  - Files: `src/tools.ts`, `src/tools.spec.ts`, entry wiring in `index.ts`
  - Tools: `reminder_create({ title, when, message?, prompt? })`, `reminder_list()`,
    `reminder_cancel({ id })`. `when` accepts a natural phrase resolved by the caller, or an ISO
    timestamp; the tool stores ISO only.
  - Verify: `npm run test -- src/tools.spec.ts` asserts the JSON schemas and that create writes
    through the store.

- [ ] Step 2.4: Run the scheduler
  - Files: `index.ts`, `src/scheduler.ts`, `src/scheduler.spec.ts`
  - One `setInterval` every 30s, plus an immediate tick on `setup`. On fire: set `firedAt`, keep the
    record for the UI, and mark it pending delivery. Clear the interval in the cleanup returned by `setup`.
  - Verify: `npm run test -- src/scheduler.spec.ts` with fake timers proves re-arm after setup,
    one-shot delivery, and no double fire after a restart.

## Phase 3: GUI part (the desktop feature)

- [ ] Step 3.1: Wire the RPC bridge
  - Files: `src/rpc.ts`, `src/gui/contract.ts`
  - Methods: `list()`, `create(input)`, `cancel({ id })`, `pending()`, `ack({ id })`
  - Verify: `npm run typecheck`; `ctx.client.rpc(Reminders)` is typed in the GUI part.

- [ ] Step 3.2: Add the side panel
  - Files: `src/gui/panel.tsx`, `src/gui/window.tsx`
  - Tab "Reminders" with rows (title, relative due time, cancel action), empty state, and
    past reminders collapsed. Mobile view via `mobile: { kind: "menu", icon: "clock" }`.
  - Verify: in Desktop at 1440px and 390px, the tab opens from the `+` menu, lists seeded
    reminders, cancels one, and shows the empty state without overflow.

- [ ] Step 3.3: Add the command and titlebar pill
  - Files: `src/gui/window.tsx`
  - Command `reminders.open` (bind `mod+shift+r`, slash `remind` with `arguments: true`) and a
    titlebar pill showing the next due reminder, hidden when nothing is pending.
  - Verify: `Cmd+K` shows the command, the keybind opens the panel, and the pill text matches the
    next reminder and disappears after cancelling it.

- [ ] Step 3.4: Add the settings page
  - Files: `src/gui/settings.tsx`
  - Read-only summary plus toggles for sound and for the `osascript` fallback.
  - Verify: page appears under Settings, search by "reminders" finds it, toggles persist across
    app restarts (declared `stores`).

## Phase 4: Delivery

- [ ] Step 4.1: Notify from the window
  - Files: `src/gui/notify.ts`
  - Poll `pending()` every 15s, call `ctx.attention.notify({ id, title, message, session? })`,
    then `ack({ id })`. Dedupe relies on the `id` so only the first window notifies.
  - Verify: create a reminder due in 60s, unfocus every window, and observe one system
    notification plus one sound; clicking it brings the app forward.

- [ ] Step 4.2: Add the headless fallback
  - Files: `src/delivery.ts`, `src/delivery.spec.ts`
  - The server part runs `osascript -e 'display notification ...'` only for reminders unacked
    after 60s, and only when the fallback setting is on.
  - Verify: `npm run test -- src/delivery.spec.ts` asserts the command string is escaped and
    that the fallback is skipped when disabled or already acked.

## Phase 5: Load, validate, document

- [ ] Step 5.1: Load the plugin globally
  - Files: `~/.config/opencode/opencode.jsonc` (append the checkout path)
  - Verify: `opencode --version` reports `2.2.5` or newer; `opencode api get /api/info` succeeds;
    Desktop lists the plugin under `Settings > Extensions > Plugins` as loaded; TUI also loads it
    without GUI errors.

- [ ] Step 5.2: End-to-end check
  - Verify: in a session, ask the agent to set a reminder one minute out, confirm the tool call
    appears, the panel shows it, the titlebar pill counts down, the notification fires, and the
    reminder moves to past after acknowledgement.

- [ ] Step 5.3: Document usage
  - Files: `README.md`
  - Cover install, tools, panel, settings, fallback behaviour, and the known limits:
    nothing fires while the OpenCode server is stopped; desktop notifications are off by
    default in `Settings > Notifications`; the GUI API is experimental.
  - Verify: `npm run format` passes and the README commands match `package.json`.

## Phase 6 (optional): Prompt the agent when a reminder fires

- [ ] Step 6.1: Add per-reminder prompt delivery
  - Files: `src/delivery.ts`, `src/tools.ts`
  - When `prompt: true`, call `ctx.session.prompt` for a chosen session instead of (or in addition to)
    the notification.
  - Verify: a reminder with `prompt: true` starts a new turn in the target session at the due time.

## Quality gate

- [x] `npm run lint`, `npm run format`, `npm run typecheck`, `npm run test` all pass
- [x] `npm run build:gui` produces a fresh bundle that the app reloads without a restart
- [x] Settings page, launcher entry, and notification delivery observed in the desktop app
- [x] One real notification observed, recorded by the app as `system:plugin:reminders…`
- [x] Limits documented in the README

## Outcome

Shipped as implemented, with these deviations from the plan:

- No `src/gui/contract.ts` or `src/gui/notify.ts`. The RPC contract lives in `src/rpc.ts`, shared by
  both parts, and notifications run from the polling loop in `src/gui/window.tsx`.
- No `reminders/index` storage key. Listing uses a paginated `scan`, which avoids a second state
  document that could drift from the records.
- Firing is claimed in-process (`src/store.ts`), because the server can activate the plugin once per
  location and several instances share one storage.
- The `osascript` fallback runs from each scheduler sweep (`awaitingFallback` + `onSweep`) instead of
  a per-reminder timer, so a plugin reload cannot drop a pending fallback.
- The panel also registers a `session.panel` menu item. A `Panel` alone only lists tabs that are
  already open, so without the menu item the panel had no way to be opened.
- When a window has focus, macOS suppresses the banner, so the window shows the reminder as an
  in-app toast instead of letting it pass unseen.

Observed in the desktop app: the settings page renders, the launcher lists Reminders after the menu
item fix, a reminder fired 12 s after its due time and was acknowledged by a window 9 ms later, and
the app recorded both the system notification and the sound for it.

Not observed: the side panel content itself, and prompt-on-fire (needs an idle session at the due
time).
