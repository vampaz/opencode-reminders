import { For, Show, createSignal } from 'solid-js';

import { history, pendingReminders, type Reminder } from '../reminder';
import { formatAbsolute, formatRelative } from '../time';
import type { ReminderUi } from './ui';

export function RemindersPanel(props: { ui: ReminderUi }) {
  const ctx = props.ui.ctx;
  const [title, setTitle] = createSignal('');
  const [when, setWhen] = createSignal('');
  const [askAgent, setAskAgent] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const upcoming = () => pendingReminders(props.ui.reminders());
  const past = () => history(props.ui.reminders()).slice(0, 5);

  async function submit(): Promise<void> {
    if (!title().trim() || !when().trim() || busy()) return;
    setBusy(true);
    try {
      const session = ctx.sessions.current();
      const created = await props.ui.create({
        title: title().trim(),
        when: when().trim(),
        ...(askAgent() && session
          ? { prompt: { sessionID: session.id, text: title().trim() } }
          : {}),
      });
      if (!created) return;
      setTitle('');
      setWhen('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px', padding: '12px' }}>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
        <ctx.ui.TextInput
          label={ctx.t('panel.what')}
          placeholder={ctx.t('panel.what')}
          value={title()}
          onInput={setTitle}
          onSubmit={() => void submit()}
        />
        <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
          <div style={{ flex: '1' }}>
            <ctx.ui.TextInput
              label={ctx.t('panel.when')}
              placeholder={ctx.t('panel.whenHint')}
              value={when()}
              onInput={setWhen}
              onSubmit={() => void submit()}
            />
          </div>
          <ctx.ui.Button
            variant="contrast"
            icon="plus"
            disabled={!title().trim() || !when().trim() || busy()}
            onClick={() => void submit()}
          >
            {ctx.t('panel.create')}
          </ctx.ui.Button>
        </div>
        <Show when={ctx.sessions.current()}>
          <ctx.ui.Switch
            label={ctx.t('panel.prompt')}
            description={ctx.t('panel.promptHint')}
            checked={askAgent()}
            onChange={setAskAgent}
          />
        </Show>
      </div>

      <Show
        when={upcoming().length > 0}
        fallback={<p style={{ margin: '0', opacity: '0.7' }}>{ctx.t('panel.empty')}</p>}
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <SectionTitle text={ctx.t('panel.pending')} />
          <For each={upcoming()}>
            {(reminder) => <ReminderRow reminder={reminder} ui={props.ui} />}
          </For>
        </div>
      </Show>

      <Show when={past().length > 0}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <SectionTitle text={ctx.t('panel.past')} />
          <For each={past()}>
            {(reminder) => <ReminderRow reminder={reminder} ui={props.ui} past />}
          </For>
        </div>
      </Show>
    </div>
  );
}

function SectionTitle(props: { text: string }) {
  return (
    <span style={{ 'font-size': '0.75rem', 'text-transform': 'uppercase', opacity: '0.6' }}>
      {props.text}
    </span>
  );
}

function ReminderRow(props: { reminder: Reminder; ui: ReminderUi; past?: boolean }) {
  const ctx = props.ui.ctx;
  const due = () =>
    props.past
      ? formatAbsolute(props.reminder.dueAt, ctx.locale.locale())
      : `${formatRelative(props.reminder.dueAt, new Date(), ctx.locale.locale())} · ${formatAbsolute(
          props.reminder.dueAt,
          ctx.locale.locale(),
        )}`;

  return (
    <div style={{ display: 'flex', gap: '8px', 'align-items': 'flex-start', padding: '6px 0' }}>
      <div style={{ flex: '1', 'min-width': '0' }}>
        <div style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
          <span
            style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}
          >
            {props.reminder.title}
          </span>
          <Show when={props.reminder.prompt}>
            <span title={ctx.t('panel.prompt')} style={{ opacity: '0.6', 'font-size': '0.75rem' }}>
              ●
            </span>
          </Show>
        </div>
        <span style={{ opacity: '0.65', 'font-size': '0.8rem' }}>{due()}</span>
        <Show when={props.reminder.message}>
          <div style={{ opacity: '0.75', 'font-size': '0.8rem' }}>{props.reminder.message}</div>
        </Show>
      </div>
      <Show
        when={!props.past}
        fallback={
          <ctx.ui.IconButton
            icon="trash"
            label={ctx.t('panel.delete')}
            onClick={() => void props.ui.remove(props.reminder.id)}
          />
        }
      >
        <ctx.ui.IconButton
          icon="trash"
          label={ctx.t('panel.cancel')}
          onClick={() => void props.ui.cancel(props.reminder.id)}
        />
      </Show>
    </div>
  );
}
