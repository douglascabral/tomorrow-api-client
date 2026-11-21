<script lang="ts">
  import type { MultipartFileField } from '../workspace-api';
  import { locale, translate } from '../i18n';

  export let rows: MultipartFileField[] = [];
  export let onChange: (rows: MultipartFileField[]) => void = () => {};
  export let onChooseFile: (id: string) => void = () => {};

  function addRow() {
    onChange([...rows, { id: crypto.randomUUID(), name: '', paths: [], enabled: true }]);
  }

  function update(id: string, name: string) {
    onChange(rows.map((row) => row.id === id ? { ...row, name } : row));
  }

  function removeRow(id: string) {
    onChange(rows.filter((row) => row.id !== id));
  }

  function fileNames(paths: string[]) {
    return paths.map((path) => path.split(/[\\/]/).pop() ?? path);
  }

  function removeFile(id: string, index: number) {
    onChange(rows.map((row) => row.id === id ? { ...row, paths: (row.paths ?? []).filter((_, fileIndex) => fileIndex !== index) } : row));
  }
</script>

<div class="multipart-file-editor">
  <table aria-label={translate($locale, 'Multipart files')}>
    <thead><tr><th class="enabled-column"><span class="visually-hidden">{translate($locale, 'Enabled')}</span></th><th>{translate($locale, 'Name')}</th><th>{translate($locale, 'File')}</th><th class="remove-column"><span class="visually-hidden">{translate($locale, 'Remove')}</span></th></tr></thead>
    <tbody>
      {#each rows as row, index (row.id)}
        <tr>
          <td class="enabled-column"><input type="checkbox" checked={row.enabled} aria-label={translate($locale, 'Enable file field {number}', { number: index + 1 })} onchange={(event) => onChange(rows.map((item) => item.id === row.id ? { ...item, enabled: event.currentTarget.checked } : item))} /></td>
          <td><input aria-label={translate($locale, 'File field name {number}', { number: index + 1 })} placeholder={translate($locale, 'Field name')} value={row.name} oninput={(event) => update(row.id, event.currentTarget.value)} /></td>
          <td><div class="file-list"><button class="choose-file" aria-label={translate($locale, 'Choose files for field {number}', { number: index + 1 })} onclick={() => onChooseFile(row.id)}>{translate($locale, 'Choose files')}</button>{#each fileNames(row.paths ?? (row.path ? [row.path] : [])) as name, fileIndex (`${row.id}-${fileIndex}`)}<span class="file-item">{name}<button class="remove-selected-file" aria-label={translate($locale, 'Remove file {name}', { name })} onclick={() => removeFile(row.id, fileIndex)}>×</button></span>{/each}</div></td>
          <td class="remove-column"><button class="remove-file" aria-label={translate($locale, 'Remove file field {number}', { number: index + 1 })} onclick={() => removeRow(row.id)}>×</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="add-file-field" onclick={addRow}>＋ {translate($locale, 'Add file field')}</button>
</div>

<style>
  .multipart-file-editor{flex:1;min-height:84px;margin:12px 0;padding:10px 14px;border:1px solid var(--border-subtle);border-radius:7px;background:var(--panel-bg);overflow:auto;color:var(--text-primary);font:11px system-ui}
  table{width:100%;border-collapse:collapse;text-align:left}
  th{height:25px;color:var(--text-muted);font-size:10px;font-weight:500}
  td{height:38px;border-top:1px solid var(--border-subtle)}
  th,td{padding:0 8px}
  .enabled-column{width:28px;padding-left:0}
  .remove-column{width:32px;text-align:right;padding-right:2px}
  td input:not([type=checkbox]){width:100%;height:34px;padding:0;border:0;outline:0;background:transparent;color:var(--text-input);font:11px system-ui}
  td input:focus{box-shadow:inset 0 -1px var(--accent)}
  input[type=checkbox]{width:12px;height:12px;margin:0;accent-color:var(--accent);vertical-align:middle}
  .choose-file{max-width:100%;padding:5px 9px;overflow:hidden;border:1px solid var(--border-strong);border-radius:5px;background:var(--surface-bg);color:var(--text-secondary);text-overflow:ellipsis;white-space:nowrap;font:11px system-ui;cursor:pointer}
  .file-list{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 0}
  .file-item{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 6px;border:1px solid var(--border-strong);border-radius:5px;background:var(--surface-bg);color:var(--text-secondary);font-size:10px}
  .remove-selected-file{flex:0 0 auto;width:16px;height:16px;padding:0;border:0;background:transparent;color:var(--text-soft);cursor:pointer}
  .remove-file{width:24px;height:28px;border:0;background:transparent;color:var(--text-soft);font:15px system-ui;cursor:pointer}
  .add-file-field{margin-top:8px;padding:5px 0;border:0;background:transparent;color:var(--accent);font:11px system-ui;cursor:pointer}
  .visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
