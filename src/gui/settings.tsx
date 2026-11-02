import type { ReminderUi } from './ui';

export function RemindersSettings(props: { ui: ReminderUi }) {
  const ctx = props.ui.ctx;

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px', padding: '12px 0' }}>
      <ctx.ui.Switch
        label={ctx.t('settings.sound')}
        checked={ctx.stores.prefs.value.sound}
        onChange={(checked) => ctx.stores.prefs.update((draft) => void (draft.sound = checked))}
      />
      <ctx.ui.Switch
        label={ctx.t('settings.fallback')}
        description={ctx.t('settings.fallbackHint')}
        checked={props.ui.settings().fallback}
        onChange={(checked) => void props.ui.configure(checked)}
      />
      <p style={{ margin: '0', opacity: '0.7', 'font-size': '0.85rem' }}>
        {ctx.t('settings.notificationNote')}
      </p>
      <div>
        <ctx.ui.Button icon="notifications" onClick={() => props.ui.open()}>
          {ctx.t('settings.open')}
        </ctx.ui.Button>
      </div>
    </div>
  );
}
