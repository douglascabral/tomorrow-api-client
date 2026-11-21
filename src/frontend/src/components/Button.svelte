<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'back' = 'primary';
  export let type: 'button' | 'submit' = 'button';
  export let disabled = false;
  export let className = '';
  export let label = '';
  export let onclick: (() => void) | undefined = undefined;
</script>

<button class={`${variant} ${className}`} {type} {disabled} {onclick}><slot>{label}</slot></button>
