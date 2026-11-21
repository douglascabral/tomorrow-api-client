<script lang="ts">
  import type { KeyValueRow } from '../workspace-api';
  import { locale, translate } from '../i18n';

  export let rows: KeyValueRow[] = [];
  export let showTypes = false;
  let pendingRemoval = '';
  export let ariaLabel = 'Key-value pairs';
  export let itemName = 'item';
  export let addLabel = 'Add item';
  export let suggestions: string[] = [];
  export let onChange: (rows: KeyValueRow[]) => void = () => {};
  const suggestionListID = `variables-${crypto.randomUUID()}`;

  function update(id: string, field: 'key' | 'value' | 'enabled' | 'secret', value: string | boolean) {
    onChange(rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  function addRow() {
    onChange([...rows, { id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
  }

  function removeRow(id: string) {
    onChange(rows.filter((row) => row.id !== id));
  }
</script>

<div class="key-value-editor">
  <table aria-label={translate($locale, ariaLabel)}>
    <thead><tr><th class="enabled-column"><span class="visually-hidden">{translate($locale, 'Enabled')}</span></th><th>{translate($locale, 'Key')}</th><th>{translate($locale, 'Value')}</th>{#if showTypes}<th>{translate($locale, 'Exportable')}</th>{/if}<th class="remove-column"><span class="visually-hidden">{translate($locale, 'Remove')}</span></th></tr></thead>
    <tbody>
      {#each rows as row, index (row.id)}
        <tr>
          <td class="enabled-column"><input type="checkbox" checked={row.enabled} aria-label={translate($locale, 'Enable {item} {number}', { item: translate($locale, itemName), number: index + 1 })} onchange={(event) => update(row.id, 'enabled', event.currentTarget.checked)} /></td>
          <td><input list={suggestions.length ? suggestionListID : undefined} aria-label={translate($locale, '{item} key {number}', { item: translate($locale, itemName), number: index + 1 })} value={row.key} oninput={(event) => update(row.id, 'key', event.currentTarget.value)} /></td>
          <td><input type={showTypes && row.secret ? 'password' : 'text'} list={suggestions.length ? suggestionListID : undefined} aria-label={translate($locale, '{item} value {number}', { item: translate($locale, itemName), number: index + 1 })} value={row.value} oninput={(event) => update(row.id, 'value', event.currentTarget.value)} /></td>
          {#if showTypes}<td><input type="checkbox" checked={!row.secret} aria-label={translate($locale, 'Export variable {number}', { number: index + 1 })} onchange={(event) => update(row.id, 'secret', !event.currentTarget.checked)} /></td>{/if}
          <td class="remove-column"><button class="key-value-remove" aria-label={translate($locale, 'Remove {item} {number}', { item: translate($locale, itemName), number: index + 1 })} onclick={() => pendingRemoval = row.id}>×</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if suggestions.length}<datalist id={suggestionListID}>{#each suggestions as suggestion}<option value={suggestion}></option>{/each}</datalist>{/if}
  <button class="key-value-add" onclick={addRow}>＋ {translate($locale, addLabel)}</button>
</div>

{#if pendingRemoval}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-row-title"><h2 id="remove-row-title">{translate($locale, 'Remove item')}</h2><p>{translate($locale, 'Remove this item?')}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => pendingRemoval = ''}>{translate($locale, 'Cancel')}</button><button class="danger-button" onclick={() => { removeRow(pendingRemoval); pendingRemoval = ''; }}>{translate($locale, 'Remove')}</button></div></div></div>{/if}

<style>
  .key-value-editor{flex:1;min-height:120px;margin-top:12px;padding:12px 16px;border:1px solid var(--border-subtle);border-radius:7px;background:var(--panel-bg);overflow:auto}
  table{width:100%;border-collapse:collapse;text-align:left;color:var(--text-primary);font:11px system-ui}
  th{height:25px;color:var(--text-muted);font-size:10px;font-weight:500}
  td{height:38px;border-top:1px solid var(--border-subtle)}
  th,td{padding:0 8px}
  .enabled-column{width:28px;padding-left:0}
  .remove-column{width:30px;text-align:right;padding-right:2px}
  td input:not([type=checkbox]){width:100%;height:34px;padding:0;border:0;outline:0;background:transparent;color:var(--text-input);font:11px system-ui}
  td input:not([type=checkbox]):focus{box-shadow:inset 0 -1px var(--accent)}
  input[type=checkbox]{width:12px;height:12px;margin:0;accent-color:var(--accent);vertical-align:middle}
  .key-value-remove{width:24px;height:28px;border:0;background:transparent;color:var(--text-subtle);font:15px system-ui;cursor:pointer}
  .key-value-add{margin-top:8px;padding:5px 0;border:0;background:transparent;color:var(--accent);font:11px system-ui;cursor:pointer}
  .visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
