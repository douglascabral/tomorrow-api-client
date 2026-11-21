<script lang="ts">
  import Button from './Button.svelte';
  import { locale, translate } from '../i18n';
  export let id: string;
  export let label: string;
  export let value = '';
  export let placeholder = '';
  export let onBrowse: (() => void) | undefined = undefined;
</script>

<div class="folder-picker">
  <label for={id}>{label}</label>
  <div class="folder-row">
    <input {id} value={value} {placeholder} readonly />
    <Button variant="secondary" className="browse" onclick={onBrowse}>{translate($locale, 'Browse')}</Button>
  </div>
</div>

<style>
  .folder-picker { display: flex; flex-direction: column; gap: 10px; }
  .folder-picker > label { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-top: 6px; }
  .folder-row { display: flex; gap: 10px; }
  .folder-row input { width: 100%; height: 44px; min-width: 0; flex: 1; border-radius: 8px; border: 1px solid var(--border-strong); background: var(--surface-bg); color: var(--text-input); padding: 0 14px; font: 14px system-ui; outline: none; }
  .folder-row input:focus { border-color: var(--accent); }
  .folder-row input::placeholder { color: var(--text-muted); }
</style>
