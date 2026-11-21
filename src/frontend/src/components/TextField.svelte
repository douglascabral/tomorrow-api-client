<script lang="ts">
  export let id: string;
  export let label: string;
  export let value = '';
  export let type = 'text';
  export let autocomplete: 'off' | 'new-password' | 'current-password' = 'off';
  export let placeholder = '';
  export let maxlength: number | undefined = undefined;
  export let required = false;
  export let readonly = false;
</script>

<div class="text-field">
  <label for={id}>{label}</label>
  <input {id} {type} {autocomplete} {placeholder} {maxlength} {required} {readonly} bind:value />
</div>

<style>
  .text-field { display: flex; flex-direction: column; gap: 10px; }
  label { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-top: 6px; }
  input { width: 100%; height: 44px; border-radius: 8px; border: 1px solid var(--border-strong); background: var(--surface-bg); color: var(--text-input); padding: 0 14px; font: 14px system-ui; outline: none; }
  input:focus { border-color: var(--accent); }
  input::placeholder { color: var(--text-muted); }
</style>
