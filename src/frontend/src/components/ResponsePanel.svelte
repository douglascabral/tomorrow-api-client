<script lang="ts">
  import type { HTTPResponse } from '../workspace-api';
  import { locale, translate } from '../i18n';
  import Select from './Select.svelte';

  export let response: HTTPResponse | null = null;
  export let code = '';
  export let codeLanguage = 'cURL';
  export let codeLanguages: string[] = [];
  export let responseTab = 'Body';
  export let requestHeaders: Record<string, string> = {};
  export let requestLine = '';
  export let requestURL = '';
  export let requestBusy = false;
  export let requestError = '';
  export let onTabChange: (tab: string) => void = () => {};
  export let onLanguageChange: (language: string) => void = () => {};
  export let onRetry: () => void = () => {};

  const toolbarHeight = 52;
  const maximumAccessibleHeight = 1000;
  const minimumHeight = 100;
  const minimumEditorHeight = 180;
  const collapsedHeight = 48;
  const keyboardStep = 24;
  let panel: HTMLDivElement;
  let minimized = false;
  let previousHeight = 240;
  let formattedResponse = false;
  function prettyJSON(value: string): string {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  $: responseIsJSON = Boolean(response && (response.headers['Content-Type'] ?? '').toLowerCase().includes('json'));
  function setHeight(height: number) { const parent = panel.parentElement; if (!parent) return; const max = Math.max(minimumHeight, parent.clientHeight - minimumEditorHeight - collapsedHeight); previousHeight = Math.max(minimumHeight, Math.min(height, max)); parent.style.gridTemplateRows = `${toolbarHeight}px minmax(0,1fr) ${previousHeight}px`; }
  function toggleResponse() { minimized = !minimized; if (minimized) { const parent = panel.parentElement; if (parent) { previousHeight = Math.max(minimumHeight, panel.getBoundingClientRect().height); parent.style.gridTemplateRows = `${toolbarHeight}px minmax(0,1fr) ${collapsedHeight}px`; } } else setHeight(previousHeight); }
  function resizeStart(event: PointerEvent) { const handle = event.currentTarget as HTMLElement; handle.setPointerCapture(event.pointerId); const move = (e: PointerEvent) => setHeight(window.innerHeight - e.clientY); const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop); }; handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop); }
  const responseTabs = ['Body', 'Preview', 'Request headers', 'Response headers', 'Cookies', 'Timeline'];

  function previewSource(current: HTTPResponse): string {
    if (!current.url) return current.body;
    const safeURL = current.url.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const base = `<base href="${safeURL}">`;
    const head = /<head\b[^>]*>/i;
    const html = /<html\b[^>]*>/i;
    if (head.test(current.body)) return current.body.replace(head, (tag) => `${tag}${base}`);
    if (html.test(current.body)) return current.body.replace(html, (tag) => `${tag}<head>${base}</head>`);
    return `<head>${base}</head>${current.body}`;
  }
</script>

<div class="response-panel" bind:this={panel}>
  {#if !minimized}<div class="response-resize" role="slider" tabindex="0" aria-valuemin={minimumHeight} aria-valuemax={maximumAccessibleHeight} aria-valuenow={previousHeight} aria-label={translate($locale, 'Resize response')} aria-orientation="horizontal" onpointerdown={resizeStart} onkeydown={(event) => { if (event.key === 'ArrowUp') setHeight(previousHeight + keyboardStep); if (event.key === 'ArrowDown') setHeight(previousHeight - keyboardStep); }}></div>{/if}
  <div class="response-heading">
    <strong>{translate($locale, code ? 'Generate code' : 'Response')}</strong>
    <button class="response-toggle" aria-label={translate($locale, minimized ? 'Restore response' : 'Minimize response')} onclick={toggleResponse}>{minimized ? '▴' : '▾'}</button>
    {#if response}<span>{response.status} · {response.durationMs} ms</span>{/if}
  </div>
  {#if requestBusy}<p class="request-progress" role="status" aria-live="polite"><span class="loading-spinner" aria-hidden="true"></span>{translate($locale, 'Sending request…')}</p>{/if}
  {#if !minimized}
  <div class="response-tabs">
    {#each responseTabs as tab}<button class:selected={responseTab === tab} onclick={() => onTabChange(tab)}>{translate($locale, tab)}</button>{/each}
  </div>
  {#if code}
    <div class="code-language"><span>{translate($locale, 'Language')}</span>
      <Select id="code-language" label={translate($locale, 'Code language')} className="language-select" value={codeLanguage} options={codeLanguages.map((language) => ({ value: language, label: language }))} onChange={onLanguageChange} />
    </div>
    <pre class="response-content">{code}</pre>
  {:else if responseTab === 'Preview' && response && response.headers['Content-Type']?.includes('text/html')}
    <iframe title={translate($locale, 'HTML response preview')} sandbox="allow-scripts" srcdoc={previewSource(response)}></iframe>
  {:else if responseTab === 'Preview' && response}
    <div class="empty-response">{translate($locale, 'Preview is available for HTML responses.')}</div>
  {:else if responseTab === 'Response headers' && response}
    <pre class="response-content">{JSON.stringify(response.headers, null, 2)}</pre>
  {:else if responseTab === 'Request headers' && response}
    <pre class="response-content">{requestLine}{'\n'}{JSON.stringify(requestHeaders, null, 2)}</pre>
  {:else if responseTab === 'Request headers'}
    <div class="empty-response">{translate($locale, 'Send a request to see the response.')}</div>
  {:else if responseTab === 'Cookies' && response}
    <pre class="response-content">{response.headers['Set-Cookie'] ?? translate($locale, 'No response cookies.')}</pre>
  {:else if responseTab === 'Timeline' && response}
    <pre class="response-content">{translate($locale, 'Request')}: {requestLine}{'\n'}{translate($locale, 'URL')}: {requestURL}{'\n'}{translate($locale, 'Status')}: {response.status}{'\n'}{translate($locale, 'Total duration')}: {response.durationMs} ms</pre>
  {:else if response}
    {#if responseIsJSON}<button class="format-json" onclick={() => formattedResponse = !formattedResponse}>{translate($locale, formattedResponse ? 'Show raw JSON' : 'Format JSON response')}</button>{/if}
    <pre class="response-content">{formattedResponse ? prettyJSON(response.body) : response.body}</pre>
  {:else}
    <div class="empty-response">{translate($locale, 'Send a request to see the response.')}</div>
  {/if}
  {#if response?.scriptResults?.length}
    <div class="script-results">
      {#each response.scriptResults as result}<p>{result.passed ? '✓' : '×'} {result.name}{result.error ? `: ${result.error}` : ''}</p>{/each}
    </div>
  {/if}
  {#if requestError}<p class="request-error" role="alert">{requestError}</p><button class="save-button" disabled={requestBusy} onclick={onRetry}>{translate($locale, 'Retry')}</button>{/if}
  {/if}
</div>
