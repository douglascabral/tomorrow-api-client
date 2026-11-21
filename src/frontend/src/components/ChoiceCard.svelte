<script lang="ts">
  import Button from './Button.svelte';

  export let symbol: string;
  export let title: string;
  export let description: string;
  export let actionLabel: string;
  export let actionVariant: 'primary' | 'secondary' = 'primary';
  export let onAction: (() => void) | undefined = undefined;
</script>

<article class="choice-card">
  <span class="symbol">{symbol}</span>
  <h2>{title}</h2>
  <p>{description}</p>
  <Button variant={actionVariant} onclick={onAction}>{actionLabel}</Button>
</article>
