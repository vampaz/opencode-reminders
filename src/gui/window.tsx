import {
  Command,
  MenuItem,
  Panel,
  SettingsPage,
  TitlebarItem,
  type PanelTab,
  type Plugin,
} from '@opencode/plugin/gui';
import { createSignal, onCleanup } from 'solid-js';

import { awaitingDelivery, nextReminder, type Reminder } from '../reminder';
import { Reminders } from '../rpc';
import { formatRelative, parseWhen } from '../time';
import type { definition } from './definition';
import { RemindersPanel } from './panel';
import { RemindersSettings } from './settings';
import type { ReminderUi } from './ui';

const POLL_MS = 15_000;
const NOTIFY_WINDOW_MS = 10 * 60_000;

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const [reminders, setReminders] = createSignal<Reminder[]>([]);
  const [settings, setSettings] = createSignal({ fallback: true });

  const client = () => ctx.client.rpc(Reminders);

  function fail(error: unknown, message?: string): void {
    console.error('[reminders]', error);
    ctx.toast.show({ title: message ?? ctx.t('toast.failed'), variant: 'error' });
  }

  async function deliverPending(): Promise<void> {
    const cutoff = Date.now() - NOTIFY_WINDOW_MS;

    for (const reminder of awaitingDelivery(reminders())) {
      // A window that opens long after the due time should not replay old reminders.
      if (!reminder.firedAt || Date.parse(reminder.firedAt) < cutoff) {
        await client().ack({ id: reminder.id });
        continue;
      }

      const result = await ctx.attention.notify({
        id: reminder.id,
        title: reminder.title,
        ...(reminder.message ? { message: reminder.message } : {}),
        sound: ctx.stores.prefs.value.sound,
      });

      // A system notification is suppressed while a window has focus, so show the
      // reminder in the app too instead of letting it pass unseen.
      if (!result.notification) {
        ctx.toast.show({
          title: reminder.title,
          ...(reminder.message ? { description: reminder.message } : {}),
          icon: 'notifications',
          duration: 15_000,
        });
      }
      // Acknowledged even when the user turned notifications off: the window handled it,
      // so the headless fallback must not notify twice.
      await client().ack({ id: reminder.id });
    }
  }

  async function refresh(): Promise<void> {
    try {
      const [list, current] = await Promise.all([client().list({}), client().settings({})]);
      setReminders(list as Reminder[]);
      setSettings(current as { fallback: boolean });
      await deliverPending();
    } catch (error) {
      console.error('[reminders] refresh failed', error);
    }
  }

  async function create(input: {
    title: string;
    when: string;
    prompt?: { sessionID: string; text: string };
  }): Promise<boolean> {
    if (!parseWhen(input.when, new Date())) {
      ctx.toast.show({ title: ctx.t('panel.invalidWhen'), variant: 'error' });
      return false;
    }
    try {
      const created = (await client().create(input)) as Reminder;
      ctx.toast.show({
        title: ctx.t('toast.created', {
          when: formatRelative(created.dueAt, new Date(), ctx.locale.locale()),
        }),
      });
      await refresh();
      return true;
    } catch (error) {
      fail(error, ctx.t('panel.createFailed'));
      return false;
    }
  }

  async function cancel(id: string): Promise<void> {
    try {
      await client().cancel({ id });
      await refresh();
    } catch (error) {
      fail(error);
    }
  }

  async function setPrompt(id: string, enabled: boolean): Promise<void> {
    const session = ctx.sessions.current();
    if (enabled && !session) {
      ctx.toast.show({ title: ctx.t('command.noSession'), variant: 'error' });
      return;
    }
    try {
      await client().setPrompt(enabled && session ? { id, sessionID: session.id } : { id });
      await refresh();
    } catch (error) {
      fail(error);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await client().remove({ id });
      await refresh();
    } catch (error) {
      fail(error);
    }
  }

  async function configure(fallback: boolean): Promise<void> {
    setSettings({ fallback });
    try {
      await client().configure({ fallback });
    } catch (error) {
      setSettings({ fallback: !fallback });
      fail(error);
    }
  }

  function open(): void {
    const session = ctx.sessions.current();
    if (!session) {
      ctx.toast.show({ title: ctx.t('command.noSession') });
      return;
    }
    ctx.layout.open(`${ctx.id}:list`, session, { tab: 'select' });
  }

  async function remind(input?: string): Promise<void> {
    const text = (input ?? '').trim();
    if (!text) {
      open();
      return;
    }

    const [when, ...rest] = text.split(/\s+/);
    const title = rest.join(' ').trim();
    if (!title || !parseWhen(when, new Date())) {
      ctx.toast.show({ title: ctx.t('panel.invalidWhen'), variant: 'error' });
      return;
    }

    await create({ title, when });
  }

  const ui: ReminderUi = {
    ctx,
    reminders,
    settings,
    create,
    cancel,
    remove,
    setPrompt,
    configure,
    open,
  };

  const tab: PanelTab = {
    id: 'list',
    get title() {
      return ctx.t('panel.title');
    },
    closable: 'compact',
    fallback: true,
  };

  ctx.add(Panel, {
    id: 'list',
    region: 'side',
    wide: true,
    mobile: {
      get title() {
        return ctx.t('panel.title');
      },
      order: 45,
      kind: 'menu',
      icon: 'notifications',
    },
    list: (input) => (input.open.includes('list') ? [tab] : []),
    render: () => <RemindersPanel ui={ui} />,
  });

  ctx.add(MenuItem, (): MenuItem => {
    const session = ctx.sessions.current();
    const opened = session ? ctx.layout.state(`${ctx.id}:list`, session) !== 'closed' : false;
    return {
      menu: 'session.panel',
      id: 'list',
      title: ctx.t('panel.title'),
      icon: 'notifications',
      keybind: `${ctx.id}.open`,
      opened,
      run: open,
    };
  });

  ctx.add(Command, () => ({
    id: 'open',
    title: ctx.t('command.open'),
    keywords: 'reminders notification alert notify',
    group: ctx.t('panel.title'),
    bind: 'mod+shift+r',
    run: open,
  }));

  ctx.add(Command, (): Command => ({
    id: 'remind',
    title: ctx.t('command.remind'),
    description: ctx.t('command.remindDescription'),
    hidden: true,
    slash: { name: 'remind', arguments: true },
    run: (input) => void remind(input),
  }));

  ctx.add(TitlebarItem, (): TitlebarItem | undefined => {
    const next = nextReminder(reminders(), new Date());
    if (!next) return undefined;
    return {
      id: 'next',
      label: formatRelative(next.dueAt, new Date(), ctx.locale.locale()),
      title: ctx.t('pill.next', { title: next.title }),
      icon: 'notifications',
      run: open,
    };
  });

  ctx.add(SettingsPage, {
    id: 'reminders',
    icon: 'notifications',
    get title() {
      return ctx.t('settings.title');
    },
    get entries() {
      return [
        {
          id: 'fallback',
          title: ctx.t('settings.fallback'),
          keywords: 'reminder notification osascript',
        },
        { id: 'sound', title: ctx.t('settings.sound'), keywords: 'reminder sound audio' },
      ];
    },
    render: () => <RemindersSettings ui={ui} />,
  });

  const unsubscribe = client().events.on('fired', () => void refresh());
  onCleanup(unsubscribe);

  const timer = setInterval(() => void refresh(), POLL_MS);
  onCleanup(() => clearInterval(timer));

  void refresh();
};
