<script lang="ts">
  export let message: string;
  export let kind: 'error' | 'info' = 'error';
  export let testId: string | undefined = undefined;
</script>

<p class={kind === 'error' ? 'error' : 'destination'} role={kind === 'error' ? 'alert' : 'status'} data-testid={testId}>{message}</p>
