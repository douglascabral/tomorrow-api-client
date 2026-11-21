<script lang="ts">
  import Select from './Select.svelte';
  import { translate, type Locale } from '../i18n';
  import { DEFAULT_REQUEST_TIMEOUT_SECONDS, REQUEST_TIMEOUT_OPTIONS } from '../settings';
  import type { ThemePreference } from '../settings';

  export let locale: Locale = 'en';
  export let timeoutSeconds = DEFAULT_REQUEST_TIMEOUT_SECONDS;
  export let themePreference: ThemePreference = 'dark';
  export let onLocaleChange: (locale: Locale) => void = () => {};
  export let onTimeoutChange: (seconds: number) => void = () => {};
  export let onThemeChange: (theme: ThemePreference) => void = () => {};
  export let onChangePassword: () => void = () => {};

  const tr = (message: string, values: Record<string, string | number> = {}) => translate(locale, message, values);
</script>

<section class="management-page settings-page">
  <div class="management-heading"><div><h1>{tr('Settings')}</h1><p>{tr('Configure this app and your current workspace.')}</p></div></div>
  <div class="settings-panel">
    <section class="settings-section"><h2>{tr('General')}</h2>
      <div class="settings-row"><div><strong>{tr('Language')}</strong><small>{tr('More translations can be added later.')}</small></div>
        <Select id="settings-language" label={tr('Language')} className="settings-select" value={locale} options={[{ value: 'en', label: 'English' }, { value: 'pt-BR', label: 'Português (Brasil)' }]} onChange={(value) => onLocaleChange(value as Locale)} />
      </div>
      <div class="settings-row"><div><strong>{tr('Appearance')}</strong><small>{tr('Use the system theme or choose a fixed theme.')}</small></div>
        <Select id="settings-theme" label={tr('Appearance')} className="settings-select" value={themePreference} options={[
          { value: 'system', label: tr('System') },
          { value: 'light', label: tr('Light') },
          { value: 'dark', label: tr('Dark') },
          { value: 'high-contrast', label: tr('High contrast') },
        ]} onChange={(value) => onThemeChange(value as ThemePreference)} />
      </div>
    </section>
    <section class="settings-section"><h2>{tr('Requests')}</h2>
      <div class="settings-row"><div><strong>{tr('Request timeout')}</strong></div>
        <Select id="settings-timeout" label={tr('Request timeout')} className="settings-select" value={String(timeoutSeconds)} options={REQUEST_TIMEOUT_OPTIONS.map((seconds) => ({ value: String(seconds), label: tr('{number} seconds', { number: seconds }) }))} onChange={(value) => onTimeoutChange(Number(value))} />
      </div>
      <div class="settings-row"><div><strong>{tr('Proxy')}</strong><small>{tr('Requests use the system proxy settings.')}</small></div><span class="settings-value">{tr('System proxy')}</span></div>
    </section>
    <section class="settings-section security-section"><h2>{tr('Workspace security')}</h2>
      <p class="encryption-status">✓ {tr('Encrypted with your workspace password')}</p>
      <div class="settings-row"><strong>{tr('Lock workspace when the app closes')}</strong><input type="checkbox" aria-label={tr('Lock workspace when the app closes')} checked disabled /></div>
      <div class="settings-row"><strong>{tr('Change password')}</strong><button class="settings-link" onclick={onChangePassword}>{tr('Change password')} →</button></div>
      <p class="privacy-note">{tr('No telemetry. Requests run only when you choose to send them.')}</p>
    </section>
  </div>
  <p class="settings-about">Tomorrow · {tr('Local API client')}</p>
</section>
