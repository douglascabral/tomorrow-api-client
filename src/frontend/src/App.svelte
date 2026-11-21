<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount, tick } from 'svelte';
  import { locale, translate } from './i18n';
  import Brand from './components/Brand.svelte';
  import Select from './components/Select.svelte';
  import Button from './components/Button.svelte';
  import ChoiceCard from './components/ChoiceCard.svelte';
  import FolderPicker from './components/FolderPicker.svelte';
  import Message from './components/Message.svelte';
  import TextField from './components/TextField.svelte';
  import WorkspaceCard from './components/WorkspaceCard.svelte';
  import RequestTree from './components/RequestTree.svelte';
  import KeyValueTable from './components/KeyValueTable.svelte';
  import MultipartFileTable from './components/MultipartFileTable.svelte';
  import ResponsePanel from './components/ResponsePanel.svelte';
  import SettingsScreen from './components/SettingsScreen.svelte';
  import { DEFAULT_REQUEST_TIMEOUT_SECONDS, REQUEST_TIMEOUT_OPTIONS, DEFAULT_THEME_PREFERENCE, isThemePreference, type AppliedTheme, type ThemePreference } from './settings';
  import { WorkspaceService, type Environment, type HistoryEntry, type HTTPResponse, type KeyValueRow, type MultipartFileField, type RequestNode } from './workspace-api';

  type Screen = 'welcome' | 'create' | 'unlock' | 'ready';
  type Workspace = { path: string; name: string };

  function tr(message: string, values: Record<string, string | number> = {}): string {
    return translate($locale, message, values);
  }

  if (typeof document !== 'undefined') document.documentElement.lang = get(locale);

  let screen: Screen = 'welcome';
  let workspaceName = tr('My workspace');
  let parentFolder = '';
  let workspacePath = '';
  let password = '';
  let confirmation = '';
  let error = '';
  let busy = false;
  let opened: Workspace | null = null;
  let collections: RequestNode[] = [];
  let activeRequest: RequestNode | null = null;
  let selectedTreeID = '';
  let draft = { name: tr('New request'), method: 'GET', url: '', body: '', headers: {} as Record<string, string> };
  let response: HTTPResponse | null = null;
  let sentRequestHeaders: Record<string, string> = {};
  let requestError = '';
  let requestBusy = false;
  let savingBusy = false;
  let responseTab = 'Body';
  let code = '';
  let codeModalOpen = false;
  let sentRequestLine = '';
  let sentRequestURL = '';
  let bodyVariablePrefix: string | null = null;
  let bodyVariableRange: { start: number; end: number } | null = null;
  let urlVariablePrefix: string | null = null;
  const minimumURLSuggestionOffset = 0;
  let urlVariableRange: { start: number; end: number } | null = null;
  let urlSuggestionOffset = minimumURLSuggestionOffset;
  let codeLanguage = 'cURL';
  const codeLanguages = ['cURL', 'wget', 'PHP', 'Node.js', 'Python', 'Go', 'Java'];
  let requestTab = 'Body';
  let authType = 'none';
  let authToken = '';
  let authUsername = '';
  let authPassword = '';
  let queryRows: KeyValueRow[] = [];
  let headerRows: KeyValueRow[] = [];
  let authCredentialRows: KeyValueRow[] = [];
  let bodyType = 'JSON';
  let filePath = '';
  let multipartFiles: MultipartFileField[] = [];
  let preRequestScript = '';
  let postResponseScript = '';
  let testScript = '';
  let saved = false;
  let historyVisible = false;
  let managementView: 'collections' | 'environments' | 'transfer' | 'settings' = 'collections';
  const settingsStorageKey = 'tomorrow.settings.v1';
  type AppSettings = { timeoutSeconds: number; theme: ThemePreference };
  function appliedTheme(preference: ThemePreference): AppliedTheme {
    if (preference !== 'system') return preference;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function applyTheme(preference: ThemePreference) {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = appliedTheme(preference);
    document.documentElement.dataset.themePreference = preference;
  }
  function loadSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(settingsStorageKey);
      const parsed = stored ? JSON.parse(stored) as Partial<AppSettings> : {};
      return {
        timeoutSeconds: REQUEST_TIMEOUT_OPTIONS.includes(Number(parsed.timeoutSeconds) as typeof REQUEST_TIMEOUT_OPTIONS[number]) ? Number(parsed.timeoutSeconds) : DEFAULT_REQUEST_TIMEOUT_SECONDS,
        theme: isThemePreference(parsed.theme) ? parsed.theme : DEFAULT_THEME_PREFERENCE,
      };
    } catch { return { timeoutSeconds: DEFAULT_REQUEST_TIMEOUT_SECONDS, theme: DEFAULT_THEME_PREFERENCE }; }
  }
  let appSettings = loadSettings();
  applyTheme(appSettings.theme);
  let changingPassword = false;
  let currentPassword = '';
  let newPassword = '';
  let passwordConfirmation = '';
  let settingsError = '';
  function saveSettings() { localStorage.setItem(settingsStorageKey, JSON.stringify(appSettings)); }
  function changeTheme(value: ThemePreference) {
    appSettings.theme = value;
    applyTheme(value);
    saveSettings();
  }
  function changeLocale(value: 'en' | 'pt-BR') {
    locale.set(value);
    document.documentElement.lang = value;
    localStorage.setItem('tomorrow.locale', value);
  }
  let pendingImport: File | null = null;
  let exportSelection = 'collections';
  let importSummary = '';
  let duplicateEnvironmentID = '';
  let managementEnvironmentID = '';
  let managementRows: KeyValueRow[] = [];
  function showEnvironment(id: string) { managementEnvironmentID = id; const environment = environments.find((item) => item.id === id); managementRows = rowsFromMap(environment?.values ?? {}).map((row) => ({ ...row, secret: environment?.secretKeys?.includes(row.key) ?? false })); }
  async function saveManagementEnvironment() { const next = environments.map((item) => item.id === managementEnvironmentID ? { ...item, values: valuesFromRows(managementRows), secretKeys: managementRows.filter((row) => row.enabled && row.secret && row.key.trim()).map((row) => row.key.trim()) } : item); await WorkspaceService.SaveEnvironments(next); environments = next; }
  async function openManagement(view: 'environments' | 'transfer' | 'settings') { if (!await saveOrDiscardDraft()) return; managementView = view; historyVisible = false; if (view === 'environments') showEnvironment(activeEnvironmentID || environments[0]?.id || ''); }
  async function changeWorkspacePassword(event: SubmitEvent) {
    event.preventDefault(); settingsError = '';
    try {
      await WorkspaceService.ChangePassword(currentPassword, newPassword, passwordConfirmation);
      changingPassword = false; currentPassword = ''; newPassword = ''; passwordConfirmation = '';
    } catch (cause) { settingsError = String(cause).includes('password confirmation') ? tr('Passwords do not match.') : tr('Could not change workspace password.'); }
  }
  let requestHistory: HistoryEntry[] = [];
  let historyError = '';
  let historyEntryToRemove: { index: number; name: string } | null = null;
  let runResults: Array<{ name: string; status: string }> = [];
  let savedDraft = '';
  let movingNode: RequestNode | null = null;
  let moveDestinations: RequestNode[] = [];
  let moveTargetID = '';
  let environments: Environment[] = [];
  let activeEnvironmentID = '';
  let environmentMenuOpen = false;

  onMount(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
    const applySystemTheme = () => { if (appSettings.theme === 'system') applyTheme('system'); };
    systemTheme.addEventListener('change', applySystemTheme);
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.environment-control')) environmentMenuOpen = false;
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => {
      systemTheme.removeEventListener('change', applySystemTheme);
      document.removeEventListener('pointerdown', closeOutside, true);
    };
  });
  let environmentRows: KeyValueRow[] = [];
  let editingEnvironmentID = '';
  let environmentToDelete = '';
  let pendingCredentialRemoval: (() => void) | null = null;

  function editEnvironment(environment: Environment) {
    environmentMenuOpen = false;
    editingEnvironmentID = environment.id;
    dialogName = environment.name;
    environmentRows = rowsFromMap(environment.values);
    dialogError = '';
    dialogKind = 'environment';
  }

  async function removeEnvironment(id: string) {
    if (environments.length < 2) { requestError = tr('Keep at least one environment.'); return; }
    environments = environments.filter((item) => item.id !== id);
    await WorkspaceService.SaveEnvironments(environments);
    if (activeEnvironmentID === id) activeEnvironmentID = environments[0].id;
  }

  async function exportPostmanJSON(filename: string, data: unknown) {
    try { await WorkspaceService.SavePostmanExport(filename, JSON.stringify(data, null, 2)); }
    catch { requestError = tr('Could not export this Postman file.'); }
  }

  async function exportEnvironment(environment: Environment) {
    const values = Object.entries(environment.values).filter(([key]) => !environment.secretKeys?.includes(key)).map(([key, value]) => ({ key, value, enabled: true, type: 'default' }));
    await exportPostmanJSON(`${environment.name}.postman_environment.json`, { name: environment.name, values });
  }

  async function importEnvironment(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { name?: string; values?: Array<{ key?: string; value?: unknown; enabled?: boolean }> };
      if (!parsed.name || !Array.isArray(parsed.values)) throw new Error('invalid');
      const environment: Environment = { id: newID(), name: parsed.name, values: Object.fromEntries(parsed.values.filter((v) => v.enabled !== false && v.key).map((v) => [v.key!, String(v.value ?? '')])) };
      environments = [...environments, environment]; await WorkspaceService.SaveEnvironments(environments); activeEnvironmentID = environment.id;
    } catch { requestError = tr('Could not import this Postman environment.'); }
    input.value = '';
  }

  async function exportCollection() {
    const item = (node: RequestNode): Record<string, unknown> => node.kind === 'request'
      ? { name: node.name, request: { method: node.method ?? 'GET', url: node.url ?? '', header: Object.entries(node.headers ?? {}).map(([key, value]) => ({ key, value })), body: { mode: 'raw', raw: node.body ?? '' } } }
      : { name: node.name, item: (node.children ?? []).map(item) };
    const data = { info: { name: opened?.name ?? 'Tomorrow Collection', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: collections.map(item) };
    await exportPostmanJSON('tomorrow.postman_collection.json', data);
  }

  async function choosePostmanFile(event: Event) { const input = event.currentTarget as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return; try { const data = JSON.parse(await file.text()); if (data.info?.schema?.includes('/collection/v2.1.0/') && Array.isArray(data.item)) importSummary = `${data.info.name} · ${data.item.length} items`; else if (data.name && Array.isArray(data.values)) importSummary = `${data.name} · ${data.values.length} variables`; else throw new Error('format'); pendingImport = file; } catch { requestError = tr('Could not import this Postman file.'); } }
  async function importPostmanFile() {
    const file = pendingImport; if (!file) return; pendingImport = null;
    try {
      const data = JSON.parse(await file.text());
      if (data.info?.schema?.includes('/collection/v2.1.0/')) {
        const convert = (items: Array<Record<string, any>>): RequestNode[] => items.map((entry) => {
          if (Array.isArray(entry.item)) return { id: newID(), name: String(entry.name ?? tr('Collection')), kind: 'collection', children: convert(entry.item) };
          const req = entry.request ?? {}; const url = typeof req.url === 'string' ? req.url : req.url?.raw ?? '';
          return { id: newID(), name: String(entry.name ?? tr('New request')), kind: 'request', method: String(req.method ?? 'GET'), url, headers: Object.fromEntries((req.header ?? []).filter((h: {disabled?: boolean; key: string}) => !h.disabled).map((h: {key: string; value: string}) => [h.key, h.value])), body: req.body?.raw ?? '' };
        });
        collections = [...collections, ...convert(data.item ?? [])]; await WorkspaceService.SaveCollections(collections);
      } else if (data.name && Array.isArray(data.values)) {
        const imported: Environment = { id: newID(), name: data.name, values: Object.fromEntries(data.values.filter((v: {enabled?: boolean; key?: string}) => v.enabled !== false && v.key).map((v: {key: string; value: unknown}) => [v.key, String(v.value ?? '')])) };
        environments = [...environments, imported]; await WorkspaceService.SaveEnvironments(environments); activeEnvironmentID = imported.id;
      } else throw new Error('format');
    } catch { requestError = tr('Could not import this Postman file.'); }
  }
  let dialogError = '';
  let dialogKind: 'rename' | 'delete' | 'unsaved' | 'environment' | 'clear-history' | 'remove-history' | null = null;
  let dialogName = '';
  let renameTarget: RequestNode | null = null;
  let deleteTarget: RequestNode | null = null;
  let leaveResolver: ((choice: 'save' | 'discard' | 'stay') => void) | null = null;

  function draftSnapshot(): string {
    return JSON.stringify({ draft, queryRows, headerRows, authCredentialRows, authType, authToken, authUsername, authPassword, bodyType, filePath, multipartFiles, preRequestScript, postResponseScript, testScript });
  }

  function visit(nodes: RequestNode[], depth = 0): Array<{ node: RequestNode; depth: number }> {
    return nodes.flatMap((node) => [{ node, depth }, ...visit(node.children ?? [], depth + 1)]);
  }

  function newID(): string { return crypto.randomUUID(); }

  function rowsFromMap(values: Record<string, string> = {}): KeyValueRow[] {
    return Object.entries(values).map(([key, value]) => ({ id: newID(), key, value, enabled: true }));
  }

  function rowsFromRequest(rows: KeyValueRow[] | undefined, values: Record<string, string> = {}): KeyValueRow[] {
    return rows?.map((row) => ({ ...row })) ?? rowsFromMap(values);
  }

  function valuesFromRows(rows: KeyValueRow[]): Record<string, string> {
    return Object.fromEntries(rows.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value]));
  }

  function selectedEnvironment(): Environment | undefined {
    return environments.find((item) => item.id === activeEnvironmentID);
  }

  function resolveEnvironmentValue(value: string): string {
    const values = selectedEnvironment()?.values ?? {};
    return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (placeholder, key: string) => values[key.trim()] ?? placeholder);
  }

  function resolveEnvironmentValues(values: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, resolveEnvironmentValue(value)]));
  }

  function addAuthCredential() {
    authCredentialRows = [...authCredentialRows, { id: newID(), key: '', value: '', enabled: true }];
  }

  function updateAuthCredential(id: string, field: 'key' | 'value' | 'enabled', value: string | boolean) {
    authCredentialRows = authCredentialRows.map((row) => row.id === id ? { ...row, [field]: value } : row);
  }

  function removeAuthCredential(id: string) {
    authCredentialRows = authCredentialRows.filter((row) => row.id !== id);
  }

  function requestHeaders(customHeaders: Record<string, string> = valuesFromRows(headerRows)): Record<string, string> {
    return { ...customHeaders, ...valuesFromRows(authCredentialRows) };
  }

  async function loadCollections() {
    try {
      collections = await WorkspaceService.Collections();
      const firstRequest = visit(collections).find((row) => row.node.kind === 'request')?.node;
      if (firstRequest) selectRequest(firstRequest);
      else { activeRequest = null; selectedTreeID = ''; }
    } catch { requestError = tr('Could not load collections.'); }
  }

  async function loadEnvironments() {
    try {
      environments = await WorkspaceService.Environments();
      if (!environments.length) {
        environments = [{ id: newID(), name: tr('Development'), values: {} }];
        await WorkspaceService.SaveEnvironments(environments);
      }
      activeEnvironmentID = environments[0].id;
    } catch {
      requestError = tr('Could not load environments.');
    }
  }

  function selectEnvironment(id: string) {
    activeEnvironmentID = id;
    environmentMenuOpen = false;
  }

  function formatRequestJSON() {
    try { draft.body = JSON.stringify(JSON.parse(draft.body), null, 2); }
    catch { requestError = tr('Request body is not valid JSON.'); }
  }

  function trackBodyVariableInput(event: Event) {
    const input = event.currentTarget as HTMLTextAreaElement;
    const value = input.value;
    const cursor = input.selectionStart;
    const before = value.slice(0, cursor);
    const match = before.match(/\{\{\s*([^{}]*)$/);
    draft.body = value;
    bodyVariablePrefix = match?.[1] ?? null;
    bodyVariableRange = match?.index === undefined ? null : { start: match.index, end: cursor };
  }

  function insertBodyVariable(key: string) {
    const input = document.querySelector<HTMLTextAreaElement>('#request-body-editor');
    if (!input || !bodyVariableRange) return;
    const { start, end } = bodyVariableRange;
    const token = `{{${key}}}`;
    const nextValue = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    const nextCursor = start + token.length;
    input.value = nextValue;
    draft.body = nextValue;
    bodyVariablePrefix = null;
    bodyVariableRange = null;
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(nextCursor, nextCursor); });
  }

  function trackURLVariableInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = before.match(/\{\{\s*([^{}]*)$/);
    urlVariablePrefix = match?.[1] ?? null;
    urlVariableRange = match?.index === undefined ? null : { start: match.index, end: cursor };
    if (match?.index !== undefined) {
      const context = document.createElement('canvas').getContext('2d');
      if (context) {
        context.font = window.getComputedStyle(input).font;
        const padding = Number.parseFloat(window.getComputedStyle(input).paddingLeft) || minimumURLSuggestionOffset;
        urlSuggestionOffset = Math.max(minimumURLSuggestionOffset, context.measureText(before.slice(0, match.index)).width + padding - input.scrollLeft);
      }
    }
  }

  function insertURLVariable(key: string) {
    const input = document.querySelector<HTMLInputElement>('#request-url-input');
    if (!input || !urlVariableRange) return;
    const token = `{{${key}}}`;
    const { start, end } = urlVariableRange;
    const nextValue = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    const nextCursor = start + token.length;
    input.value = nextValue;
    draft.url = nextValue;
    urlVariablePrefix = null;
    urlVariableRange = null;
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(nextCursor, nextCursor); });
  }

  function startEnvironmentCreation() {
    environmentMenuOpen = false;
    dialogName = '';
    dialogError = '';
    environmentRows = [];
    duplicateEnvironmentID = '';
    dialogKind = 'environment';
  }

  async function saveEnvironment() {
    const name = dialogName.trim();
    if (!name) { dialogError = tr('Enter an environment name.'); return; }
    if (environments.some((item) => item.id !== editingEnvironmentID && item.name.toLowerCase() === name.toLowerCase())) {
      dialogError = tr('An environment with this name already exists.');
      return;
    }
    const environment = { id: editingEnvironmentID || newID(), name, values: duplicateEnvironmentID ? { ...(environments.find((item) => item.id === duplicateEnvironmentID)?.values ?? {}) } : valuesFromRows(environmentRows) };
    environments = editingEnvironmentID ? environments.map((item) => item.id === editingEnvironmentID ? environment : item) : [...environments, environment];
    await WorkspaceService.SaveEnvironments(environments);
    activeEnvironmentID = environment.id;
    dialogKind = null;
    editingEnvironmentID = '';
  }

  async function selectRequest(node: RequestNode) {
    if (activeRequest?.id === node.id) {
      await tick();
      document.querySelector<HTMLButtonElement>('.tree-row.active .tree-item')?.focus();
      return;
    }
    if (!await saveOrDiscardDraft()) return;
    historyVisible = false;
    managementView = 'collections';
    activeRequest = node;
    selectedTreeID = node.id;
    saved = false;
    draft = { name: node.name, method: node.method ?? 'GET', url: node.url ?? '', body: node.body ?? '', headers: node.headers ?? {} };
    authType = node.authType ?? 'none'; authToken = node.authToken ?? ''; authUsername = node.authUsername ?? ''; authPassword = node.authPassword ?? '';
    queryRows = rowsFromRequest(node.queryRows, node.query);
    headerRows = rowsFromRequest(node.headerRows, node.headers); bodyType = node.bodyType ?? 'JSON'; filePath = node.filePath ?? ''; multipartFiles = node.multipartFiles?.map((row) => ({ ...row, paths: row.paths ?? (row.path ? [row.path] : []) })) ?? [];
    authCredentialRows = node.authCredentials?.map((row) => ({ ...row })) ?? [];
    preRequestScript = node.preRequestScript ?? ''; postResponseScript = node.postResponseScript ?? ''; testScript = node.testScript ?? '';
    savedDraft = draftSnapshot();
    await tick();
    document.querySelector<HTMLButtonElement>('.tree-row.active .tree-item')?.focus();
    response = null;
    requestError = '';
  }

  async function showHistory() {
    if (!await saveOrDiscardDraft()) return;
    managementView = 'collections';
    historyVisible = true;
    try { requestHistory = await WorkspaceService.RequestHistory(); historyError = ''; }
    catch { historyError = tr('Could not load request history.'); }
  }

  async function clearHistory() {
    try {
      await WorkspaceService.ClearHistory();
      requestHistory = [];
      historyError = '';
      dialogKind = null;
    } catch { historyError = tr('Could not update request history.'); }
  }

  async function confirmHistoryEntryRemoval() {
    if (!historyEntryToRemove) return;
    try {
      await WorkspaceService.RemoveHistoryEntry(historyEntryToRemove.index);
      requestHistory = requestHistory.filter((_, index) => index !== historyEntryToRemove?.index);
      historyError = '';
      historyEntryToRemove = null;
      dialogKind = null;
    } catch { historyError = tr('Could not update request history.'); }
  }

  async function saveOrDiscardDraft() {
    if (!activeRequest || draftSnapshot() === savedDraft) return true;
    const choice = await new Promise<'save' | 'discard' | 'stay'>((resolve) => {
      leaveResolver = resolve;
      dialogKind = 'unsaved';
    });
    leaveResolver = null;
    dialogKind = null;
    if (choice === 'stay') return false;
    if (choice === 'save') await saveRequest();
    else savedDraft = draftSnapshot();
    return true;
  }

  function resolveLeave(choice: 'save' | 'discard' | 'stay') {
    const resolve = leaveResolver;
    leaveResolver = null;
    dialogKind = null;
    resolve?.(choice);
  }

  async function persistCollections(next: RequestNode[]) {
    collections = next;
    try { await WorkspaceService.SaveCollections(next); }
    catch { requestError = tr('Could not save collection changes.'); }
  }

  async function addCollection() {
    const collection: RequestNode = { id: newID(), name: tr('New collection'), kind: 'collection', children: [] };
    selectedTreeID = collection.id;
    const saving = persistCollections([...collections, collection]);
    await tick();
    if (selectedTreeID === collection.id) document.querySelector<HTMLButtonElement>('.tree-row.active .tree-item')?.focus();
    await saving;
  }

  async function addRequest(parent: RequestNode) {
    const request: RequestNode = { id: newID(), name: tr('New request'), kind: 'request', method: 'GET', url: '', headers: {}, body: '' };
    const append = (nodes: RequestNode[]): RequestNode[] => nodes.map((node) => node.id === parent.id
      ? { ...node, children: [...(node.children ?? []), request] }
      : { ...node, children: append(node.children ?? []) });
    await persistCollections(append(collections));
    selectRequest(request);
  }

  async function addFolder(parent: RequestNode) {
    const folder: RequestNode = { id: newID(), name: tr('New folder'), kind: 'folder', children: [] };
    const append = (nodes: RequestNode[]): RequestNode[] => nodes.map((node) => node.id === parent.id
      ? { ...node, children: [...(node.children ?? []), folder] }
      : { ...node, children: append(node.children ?? []) });
    await persistCollections(append(collections));
  }

  async function duplicateNode(target: RequestNode) {
    const clone = (node: RequestNode): RequestNode => ({ ...structuredClone(node), id: newID(), name: node.name + ' copy', children: node.children?.map(clone) });
    const copy = clone(target);
    const insert = (nodes: RequestNode[]): RequestNode[] => nodes.flatMap((node) => node.id === target.id
      ? [node, copy]
      : [{ ...node, children: insert(node.children ?? []) }]);
    await persistCollections(insert(collections));
  }

  function moveNode(target: RequestNode) {
    movingNode = target;
    const subtree = new Set(visit([target]).map(({ node }) => node.id));
    moveDestinations = visit(collections).map(({ node }) => node).filter((node) => !subtree.has(node.id) && node.kind !== 'request');
    moveTargetID = moveDestinations[0]?.id ?? '';
  }

  async function confirmMove() {
    const target = movingNode;
    const destination = moveDestinations.find((node) => node.id === moveTargetID);
    if (!target || !destination) return;
    let moving: RequestNode | undefined;
    const remove = (nodes: RequestNode[]): RequestNode[] => nodes.flatMap((node) => {
      if (node.id === target.id) { moving = node; return []; }
      return [{ ...node, children: remove(node.children ?? []) }];
    });
    const remaining = remove(collections);
    if (!moving) { movingNode = null; return; }
    const append = (nodes: RequestNode[]): RequestNode[] => nodes.map((node) => node.id === destination.id
      ? { ...node, children: [...(node.children ?? []), moving as RequestNode] }
      : { ...node, children: append(node.children ?? []) });
    await persistCollections(append(remaining));
    movingNode = null;
  }

  async function dropTreeNode(target: RequestNode, destination: RequestNode, position: 'before' | 'after' | 'inside') {
    if (visit([target]).some(({ node }) => node.id === destination.id)) return;
    if ((position === 'inside' && destination.kind === 'request') || (position !== 'inside' && destination.kind === 'collection')) return;
    let moving: RequestNode | undefined;
    const remove = (nodes: RequestNode[]): RequestNode[] => nodes.flatMap((node) => {
      if (node.id === target.id) { moving = node; return []; }
      return [{ ...node, children: remove(node.children ?? []) }];
    });
    const remaining = remove(collections);
    if (!moving) return;
    const item = moving;
    const insert = (nodes: RequestNode[]): RequestNode[] => nodes.flatMap((node) => {
      if (node.id !== destination.id) return [{ ...node, children: insert(node.children ?? []) }];
      if (position === 'inside') return [{ ...node, children: [...(node.children ?? []), item] }];
      return position === 'before' ? [item, node] : [node, item];
    });
    await persistCollections(insert(remaining));
    if (target.kind === 'request') await selectRequest(target);
    else {
      selectedTreeID = target.id;
      await tick();
      document.querySelector<HTMLButtonElement>('.tree-row.active .tree-item')?.focus();
    }
  }

  async function reorderNode(id: string, direction: 'up' | 'down') {
    let moved = false;
    const reorder = (nodes: RequestNode[]): RequestNode[] => {
      const index = nodes.findIndex((node) => node.id === id);
      const offset = direction === 'up' ? -1 : 1;
      if (index >= 0 && index + offset >= 0 && index + offset < nodes.length) {
        const result = [...nodes];
        [result[index], result[index + offset]] = [result[index + offset], result[index]];
        moved = true;
        return result;
      }
      return nodes.map((node) => ({ ...node, children: reorder(node.children ?? []) }));
    };
    const next = reorder(collections);
    if (moved) await persistCollections(next);
  }

  async function runCollection(collection: RequestNode) {
    if (!await saveOrDiscardDraft()) return;
    requestBusy = true; runResults = [];
    const runEnvironmentID = activeEnvironmentID;
    const requests = visit([collection]).map(({ node }) => node).filter((node) => node.kind === 'request');
    for (const item of requests) {
      try {
        const result = await WorkspaceService.SendRequest({
          timeoutSeconds: appSettings.timeoutSeconds,
          name: item.name, method: item.method ?? 'GET', url: resolveEnvironmentValue(item.url ?? ''), headers: resolveEnvironmentValues({ ...(item.headers ?? {}), ...valuesFromRows(item.authCredentials ?? []) }), query: resolveEnvironmentValues(item.query ?? {}),
          authType: item.authType ?? 'none', authToken: resolveEnvironmentValue(item.authToken ?? ''), authUsername: resolveEnvironmentValue(item.authUsername ?? ''), authPassword: resolveEnvironmentValue(item.authPassword ?? ''),
          environment: selectedEnvironment()?.values ?? {}, body: resolveEnvironmentValue(item.body ?? ''), bodyType: item.bodyType ?? 'JSON', filePath: item.filePath ?? '', multipartFiles: (item.multipartFiles ?? []).map((row) => ({ ...row, paths: row.paths ?? (row.path ? [row.path] : []) })).filter((row) => row.enabled && row.name.trim() && row.paths.length), preRequestScript: item.preRequestScript ?? '', postResponseScript: item.postResponseScript ?? '', testScript: item.testScript ?? '',
        });
        if (result.environment && runEnvironmentID) {
          const updatedEnvironments = environments.map((environment) => environment.id === runEnvironmentID ? { ...environment, values: result.environment! } : environment);
          await WorkspaceService.SaveEnvironments(updatedEnvironments);
          environments = updatedEnvironments;
        }
        runResults = [...runResults, { name: item.name, status: result.status }];
      } catch { runResults = [...runResults, { name: item.name, status: tr('Failed') }]; }
    }
    requestBusy = false;
  }

  function removeNode(id: string) {
    deleteTarget = visit(collections).find((row) => row.node.id === id)?.node ?? null;
    if (deleteTarget) dialogKind = 'delete';
  }

  async function confirmDelete() {
    const id = deleteTarget?.id;
    if (!id) return;
    dialogKind = null;
    const removed = visit(collections).find((row) => row.node.id === id)?.node;
    const removedIDs = new Set(removed ? visit([removed]).map((row) => row.node.id) : [id]);
    const remove = (nodes: RequestNode[]): RequestNode[] => nodes.filter((node) => node.id !== id).map((node) => ({ ...node, children: remove(node.children ?? []) }));
    await persistCollections(remove(collections));
    if (activeRequest && removedIDs.has(activeRequest.id)) activeRequest = null;
    if (removedIDs.has(selectedTreeID)) selectedTreeID = '';
  }

  async function renameNode(node: RequestNode) {
    renameTarget = node;
    dialogName = node.name;
    dialogKind = 'rename';
  }

  async function saveRename() {
    const node = renameTarget;
    const name = dialogName.trim();
    dialogKind = null;
    renameTarget = null;
    if (!node || !name) return;
    const rename = (nodes: RequestNode[]): RequestNode[] => nodes.map((item) => item.id === node.id ? { ...item, name } : { ...item, children: rename(item.children ?? []) });
    await persistCollections(rename(collections));
    if (activeRequest?.id === node.id) draft.name = name;
  }

  async function saveRequest() {
    if (!activeRequest) return;
    savingBusy = true;
    try {
    const headers = requestHeaders();
    const query = valuesFromRows(queryRows);
    const update = (nodes: RequestNode[]): RequestNode[] => nodes.map((node) => node.id === activeRequest?.id
      ? { ...node, name: draft.name, method: draft.method, url: draft.url, body: draft.body, headers, query, headerRows, queryRows, authCredentials: authCredentialRows, authType, authToken, authUsername, authPassword, bodyType, filePath, multipartFiles, preRequestScript, postResponseScript, testScript }
      : { ...node, children: update(node.children ?? []) });
    await persistCollections(update(collections));
    activeRequest = { ...activeRequest, ...draft };
    saved = true;
    savedDraft = draftSnapshot();
    } finally { savingBusy = false; }
  }

  async function sendRequest() {
    const requestEnvironmentID = activeEnvironmentID;
    requestBusy = true; requestError = ''; response = null;
    try {
      await saveRequest();
      const query = valuesFromRows(queryRows);
      const headers = resolveEnvironmentValues(requestHeaders(resolveEnvironmentValues(valuesFromRows(headerRows))));
      const outgoingHeaders: Record<string, string> = { 'User-Agent': 'Tomorrow/1.0.2', ...headers };
      if (bodyType === 'JSON' && draft.body && !Object.keys(outgoingHeaders).some((key) => key.toLowerCase() === 'content-type')) outgoingHeaders['Content-Type'] = 'application/json';
      if (bodyType === 'Text' && draft.body && !Object.keys(outgoingHeaders).some((key) => key.toLowerCase() === 'content-type')) outgoingHeaders['Content-Type'] = 'text/plain; charset=utf-8';
      if (bodyType === 'Form URL-encoded' && !Object.keys(outgoingHeaders).some((key) => key.toLowerCase() === 'content-type')) outgoingHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      if (authType === 'bearer' && authToken) outgoingHeaders.Authorization = `Bearer ${resolveEnvironmentValue(authToken)}`;
      if (authType === 'basic' && authUsername) outgoingHeaders.Authorization = `Basic ${btoa(`${resolveEnvironmentValue(authUsername)}:${resolveEnvironmentValue(authPassword)}`)}`;
      sentRequestHeaders = outgoingHeaders;
      sentRequestURL = resolveEnvironmentValue(draft.url);
      try {
        const parsed = new URL(sentRequestURL);
        Object.entries(resolveEnvironmentValues(query)).forEach(([key, value]) => parsed.searchParams.set(key, value));
        sentRequestURL = parsed.toString();
        sentRequestLine = `${draft.method} ${parsed.pathname}${parsed.search} HTTP/1.1`;
      } catch { sentRequestLine = `${draft.method} ${sentRequestURL} HTTP/1.1`; }
      response = await WorkspaceService.SendRequest({ ...draft, timeoutSeconds: appSettings.timeoutSeconds, url: resolveEnvironmentValue(draft.url), body: resolveEnvironmentValue(draft.body), headers, query: resolveEnvironmentValues(query), authType, authToken: resolveEnvironmentValue(authToken), authUsername: resolveEnvironmentValue(authUsername), authPassword: resolveEnvironmentValue(authPassword), environment: selectedEnvironment()?.values ?? {}, preRequestScript, postResponseScript, testScript, bodyType, filePath, multipartFiles: multipartFiles.map((row) => ({ ...row, paths: row.paths ?? (row.path ? [row.path] : []) })).filter((row) => row.enabled && row.name.trim() && row.paths.length) });
      if (response.environment && requestEnvironmentID) {
        const updatedEnvironments = environments.map((environment) => environment.id === requestEnvironmentID ? { ...environment, values: response!.environment! } : environment);
        await WorkspaceService.SaveEnvironments(updatedEnvironments);
        environments = updatedEnvironments;
      }
    } catch (cause) { requestError = tr(String(cause).includes('absolute HTTP URL') ? 'Enter a valid HTTP or HTTPS URL.' : 'Request failed. Check the URL and try again.'); }
    finally { requestBusy = false; }
  }

  async function chooseRequestFile() {
    try { filePath = await WorkspaceService.SelectFile(); }
    catch { requestError = tr('Could not open the file dialog.'); }
  }

  async function chooseMultipartFile(id: string) {
    try {
      const paths = await WorkspaceService.SelectFiles();
      if (paths.length) multipartFiles = multipartFiles.map((row) => row.id === id ? { ...row, paths: [...(row.paths ?? []), ...paths] } : row);
    } catch { requestError = tr('Could not open the file dialog.'); }
  }

  async function generateCodeForRequest(node: RequestNode) {
    await selectRequest(node);
    if (activeRequest?.id === node.id) generateCode();
  }

  function generateCode() {
    codeLanguage = 'cURL';
    updateCode(codeLanguage);
    codeModalOpen = true;
  }

  function updateCode(language: string) {
    const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const phpQuote = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
    const queryValues = resolveEnvironmentValues(valuesFromRows(queryRows));
    let resolvedURL = resolveEnvironmentValue(draft.url);
    try {
      const parsedURL = new URL(resolvedURL);
      Object.entries(queryValues).forEach(([key, value]) => parsedURL.searchParams.set(key, value));
      resolvedURL = parsedURL.toString();
    } catch {
      const query = new URLSearchParams(queryValues).toString();
      if (query) resolvedURL += `${resolvedURL.includes('?') ? '&' : '?'}${query}`;
    }
    const resolvedBody = resolveEnvironmentValue(draft.body);
    const url = JSON.stringify(resolvedURL);
    const body = JSON.stringify(resolvedBody);
    const shellURL = shellQuote(resolvedURL);
    const shellBody = shellQuote(resolvedBody);
    const headers = resolveEnvironmentValues(requestHeaders(valuesFromRows(headerRows)));
    headers['User-Agent'] ??= 'Tomorrow/1.0.2';
    if (bodyType === 'JSON' && resolvedBody && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    if (bodyType === 'Text' && resolvedBody && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'text/plain; charset=utf-8';
    if (bodyType === 'Form URL-encoded' && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (authType === 'bearer' && authToken) headers.Authorization = `Bearer ${resolveEnvironmentValue(authToken)}`;
    if (authType === 'basic' && authUsername) headers.Authorization = `Basic ${btoa(`${resolveEnvironmentValue(authUsername)}:${resolveEnvironmentValue(authPassword)}`)}`;
    const headerEntries = Object.entries(headers);
    const attachedFiles = multipartFiles.filter((row) => row.enabled && row.name.trim()).flatMap((row) => (row.paths ?? (row.path ? [row.path] : [])).map((path) => ({ name: row.name, path })));
    let multipartFields: Record<string, string> = {};
    if (bodyType === 'Multipart' && resolvedBody.trim()) {
      try { multipartFields = Object.fromEntries(Object.entries(JSON.parse(resolvedBody) as Record<string, unknown>).map(([key, value]) => [key, String(value)])); } catch { multipartFields = {}; }
    }
    const curlHeaders = headerEntries.map(([key, value]) => `  --header ${shellQuote(`${key}: ${value}`)}`);
    const curlBody = bodyType === 'Multipart'
      ? [...Object.entries(multipartFields).map(([key, value]) => `  --form ${shellQuote(`${key}=${value}`)}`), ...attachedFiles.map(({ name, path }) => `  --form ${shellQuote(`${name}=@${path}`)}`)]
      : bodyType === 'Binary file' && filePath ? [`  --data-binary ${shellQuote(`@${filePath}`)}`]
      : resolvedBody ? [`  --data ${shellBody}`] : [];
    const curl = [`curl --request ${draft.method} \\\n  --url ${shellURL}`, ...curlHeaders, ...curlBody].join(' \\\n');
    if (language === 'cURL') code = curl;
    else if (language === 'wget') {
      const args = [`wget --method=${draft.method}`, ...headerEntries.map(([key, value]) => `--header=${shellQuote(`${key}: ${value}`)}`)];
      if (bodyType === 'Multipart') code = `# GNU Wget does not support multipart/form-data requests.\n# Use this cURL command to send the configured fields and files:\n${curl}`;
      else {
        if (bodyType === 'Binary file' && filePath) args.push(`--body-file=${shellQuote(filePath)}`);
        else if (resolvedBody) args.push(`--body-data=${shellQuote(resolvedBody)}`);
        args.push(shellURL);
        code = args.join(' \\\n  ');
      }
    } else if (language === 'PHP') {
      const phpHeaders = headerEntries.map(([key, value]) => `    ${phpQuote(`${key}: ${value}`)}`).join(',\n');
      const phpFields = bodyType === 'Multipart'
        ? [...Object.entries(multipartFields).map(([key, value]) => `    ${phpQuote(key)} => ${phpQuote(value)}`), ...attachedFiles.map(({ name, path }) => `    ${phpQuote(attachedFiles.filter((file) => file.name === name).length > 1 ? `${name}[]` : name)} => new CURLFile(${phpQuote(path)})`)].join(',\n')
        : bodyType === 'Binary file' && filePath ? `['file' => new CURLFile(${phpQuote(filePath)})]` : phpQuote(resolvedBody);
      const phpBody = bodyType === 'Multipart' ? `[\n${phpFields}\n]` : phpFields;
      code = [`<?php`, `$ch = curl_init(${phpQuote(resolvedURL)});`, `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${draft.method}');`, `curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${phpHeaders}\n]);`, ...(resolvedBody || attachedFiles.length || filePath ? [`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpBody});`] : []), '$response = curl_exec($ch);', 'curl_close($ch);'].join('\n');
    } else if (language === 'Node.js') {
      const jsHeaders = JSON.stringify(headers, null, 2);
      if (bodyType === 'Multipart') {
        const append = [...Object.entries(multipartFields).map(([key, value]) => `form.append(${JSON.stringify(key)}, ${JSON.stringify(value)});`), ...attachedFiles.map(({ name, path }) => `form.append(${JSON.stringify(name)}, new Blob([readFileSync(${JSON.stringify(path)})]), ${JSON.stringify(path.split(/[\\/]/).pop() ?? path)});`)].join('\n');
        code = `import { readFileSync } from 'node:fs';\n\nconst form = new FormData();\n${append}\nconst response = await fetch(${url}, { method: ${JSON.stringify(draft.method)}, headers: ${jsHeaders}, body: form });\nconsole.log(await response.text());`;
      } else {
        const nodeBody = bodyType === 'Binary file' && filePath ? `, body: readFileSync(${JSON.stringify(filePath)})` : resolvedBody ? `, body: ${body}` : '';
        code = `import { readFileSync } from 'node:fs';\n\nconst response = await fetch(${url}, { method: ${JSON.stringify(draft.method)}, headers: ${jsHeaders}${nodeBody} });\nconsole.log(await response.text());`;
      }
    } else if (language === 'Python') {
      const pyHeaders = JSON.stringify(headers, null, 2);
      if (bodyType === 'Multipart') {
        const pyFields = JSON.stringify(multipartFields, null, 2);
        const pyFiles = attachedFiles.map(({ name, path }) => `    (${JSON.stringify(name)}, open(${JSON.stringify(path)}, 'rb'))`).join(',\n');
        code = `import requests\n\nfiles = [\n${pyFiles}\n]\nresponse = requests.request(${JSON.stringify(draft.method)}, ${url}, headers=${pyHeaders}, data=${pyFields}, files=files)\nprint(response.text)`;
      } else {
        const pyBody = bodyType === 'Binary file' && filePath ? `, data=open(${JSON.stringify(filePath)}, 'rb')` : resolvedBody ? `, data=${body}` : '';
        code = `import requests\n\nresponse = requests.request(${JSON.stringify(draft.method)}, ${url}, headers=${pyHeaders}${pyBody})\nprint(response.text)`;
      }
    } else if (language === 'Go') {
      if (bodyType === 'Multipart') {
        const goFields = Object.entries(multipartFields).map(([key, value]) => `writer.WriteField(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join('\n');
        const goFiles = attachedFiles.map(({ name, path }, index) => `{\nfile${index}, err := os.Open(${JSON.stringify(path)})\nif err != nil { panic(err) }\npart${index}, err := writer.CreateFormFile(${JSON.stringify(name)}, filepath.Base(${JSON.stringify(path)}))\nif err != nil { panic(err) }\nif _, err := io.Copy(part${index}, file${index}); err != nil { panic(err) }\nfile${index}.Close()\n}`).join('\n');
        code = `// Required imports: bytes, io, mime/multipart, net/http, os, path/filepath\nvar bodyBuffer bytes.Buffer\nwriter := multipart.NewWriter(&bodyBuffer)\n${goFields}\n${goFiles}\nwriter.Close()\nrequest, err := http.NewRequest(${JSON.stringify(draft.method)}, ${url}, &bodyBuffer)\nif err != nil { panic(err) }\nrequest.Header.Set("Content-Type", writer.FormDataContentType())\n${headerEntries.map(([key, value]) => `request.Header.Set(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join('\n')}\nresponse, err := http.DefaultClient.Do(request)`;
      } else {
        const goBody = bodyType === 'Binary file' && filePath ? `file, err := os.Open(${JSON.stringify(filePath)})\nif err != nil { panic(err) }\ndefer file.Close()\nrequest, err := http.NewRequest(${JSON.stringify(draft.method)}, ${url}, file)` : `request, err := http.NewRequest(${JSON.stringify(draft.method)}, ${url}, strings.NewReader(${body}))`;
        code = `// Required imports: net/http, strings${bodyType === 'Binary file' ? ', os' : ''}\n${goBody}\nif err != nil { panic(err) }\n${headerEntries.map(([key, value]) => `request.Header.Set(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join('\n')}\nresponse, err := http.DefaultClient.Do(request)`;
      }
    } else if (language === 'Java') {
      const javaHeaders = headerEntries.map(([key, value]) => `    .header(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join('\n');
      const publisher = bodyType === 'Binary file' && filePath ? `HttpRequest.BodyPublishers.ofFile(Path.of(${JSON.stringify(filePath)}))` : resolvedBody ? `HttpRequest.BodyPublishers.ofString(${body})` : 'HttpRequest.BodyPublishers.noBody()';
      if (bodyType === 'Multipart') {
        const javaFields = Object.entries(multipartFields).map(([key, value]) => `writePart(body, boundary, ${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n');
        const javaFiles = attachedFiles.map(({ name, path }) => `writeFilePart(body, boundary, ${JSON.stringify(name)}, Path.of(${JSON.stringify(path)}));`).join('\n');
        const javaHelpers = `\nstatic void writePart(ByteArrayOutputStream body, String boundary, String name, String value) throws IOException {\n    body.write(("--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\\"" + name + "\\\"\\r\\n\\r\\n" + value + "\\r\\n").getBytes(StandardCharsets.UTF_8));\n}\nstatic void writeFilePart(ByteArrayOutputStream body, String boundary, String name, Path path) throws IOException {\n    body.write(("--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\\"" + name + "\\\"; filename=\\\"" + path.getFileName() + "\\\"\\r\\nContent-Type: application/octet-stream\\r\\n\\r\\n").getBytes(StandardCharsets.UTF_8));\n    body.write(Files.readAllBytes(path));\n    body.write("\\r\\n".getBytes(StandardCharsets.UTF_8));\n}`;
        code = `// Required imports: java.io.*, java.net.*, java.net.http.*, java.nio.*, java.nio.file.*, java.nio.charset.*, java.util.*\nString boundary = "TomorrowBoundary";\nByteArrayOutputStream body = new ByteArrayOutputStream();\n${javaFields}\n${javaFiles}\nbody.write(("--" + boundary + "--\\r\\n").getBytes(StandardCharsets.UTF_8));\nHttpRequest request = HttpRequest.newBuilder(URI.create(${url}))\n${javaHeaders}\n    .header("Content-Type", "multipart/form-data; boundary=" + boundary)\n    .method(${JSON.stringify(draft.method)}, HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))\n    .build();\nHttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());${javaHelpers}`;
      } else {
        code = `HttpRequest request = HttpRequest.newBuilder(URI.create(${url}))\n${javaHeaders}\n    .method(${JSON.stringify(draft.method)}, ${publisher})\n    .build();\nHttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());`;
      }
    }
    else code = curl;
  }

  async function chooseParent() {
    error = '';
    try {
      const folder = await WorkspaceService.SelectFolder();
      if (folder) parentFolder = folder;
    } catch {
      error = tr('Could not open the folder dialog.');
    }
  }

  async function chooseWorkspace() {
    error = '';
    try {
      const folder = await WorkspaceService.SelectFolder();
      if (!folder) return;
      workspacePath = folder;
      const parts = folder.split(/[\\/]/).filter(Boolean);
      opened = { path: folder, name: parts[parts.length - 1] ?? folder };
      password = '';
      screen = 'unlock';
    } catch {
      error = tr('Could not open the folder dialog.');
    }
  }

  $: destination = parentFolder && workspaceName.trim()
    ? `${parentFolder.replace(/[\\/]$/, '')}/${workspaceName.trim()}`
    : '';

  function errorMessage(value: unknown): string {
    const message = String(value);
    if (message.includes('name is invalid')) return tr('Enter a valid workspace name.');
    if (message.includes('folder is invalid')) return tr('Choose an existing folder.');
    if (message.includes('confirmation does not match')) return tr('Passwords do not match.');
    if (message.includes('password is required')) return tr('Enter a password.');
    if (message.includes('already exists')) return tr('A folder with this name already exists.');
    if (message.includes('password is incorrect')) return tr('Incorrect password or invalid workspace.');
    return tr('Could not open this workspace.');
  }

  async function createWorkspace(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (!parentFolder) { error = tr('Choose a parent folder.'); return; }
    busy = true;
    try {
      enterWorkspace(await WorkspaceService.CreateWorkspace(parentFolder, workspaceName, password, confirmation));
    } catch (cause) {
      error = errorMessage(cause);
    } finally { busy = false; }
  }

  async function unlockWorkspace(event: SubmitEvent) {
    event.preventDefault();
    if (!workspacePath) { error = tr('Choose a workspace folder.'); return; }
    busy = true;
    error = '';
    try {
      enterWorkspace(await WorkspaceService.OpenWorkspace(workspacePath, password));
    } catch (cause) {
      error = errorMessage(cause);
    } finally { busy = false; }
  }

  function enterWorkspace(value: Workspace) {
    opened = value;
    password = '';
    confirmation = '';
    screen = 'ready';
    void loadCollections();
    void loadEnvironments();
  }

  async function changeWorkspace() {
    if (!await saveOrDiscardDraft()) return;
    opened = null;
    collections = [];
    environments = [];
    activeEnvironmentID = '';
    environmentMenuOpen = false;
    activeRequest = null;
    selectedTreeID = '';
    requestHistory = [];
    response = null;
    responseTab = 'Body';
    historyVisible = false;
    runResults = [];
    code = '';
    requestError = '';
    workspacePath = '';
    parentFolder = '';
    password = '';
    confirmation = '';
    error = '';
    screen = 'welcome';
  }
</script>

<svelte:head><title>{tr('Tomorrow · Workspace')}</title></svelte:head>

<main>{#key $locale}
  {#if screen !== 'ready'}<Brand />{/if}

  {#if screen === 'welcome'}
    <section class="welcome" aria-labelledby="welcome-title">
      <h1 id="welcome-title">{tr('Your API workspace, on your terms.')}</h1>
      <p class="subtitle">{tr('Local by default. Encrypted with your password. Ready to work offline.')}</p>
      <div class="choice-grid">
        <ChoiceCard symbol="+" title={tr('Create a workspace')} description={tr('Start fresh with an encrypted local workspace.')} actionLabel={tr('Create workspace')} onAction={() => { error = ''; screen = 'create'; }} />
        <ChoiceCard symbol="↗" title={tr('Open existing')} description={tr('Choose a workspace folder on this device.')} actionLabel={tr('Choose workspace')} actionVariant="secondary" onAction={chooseWorkspace} />
      </div>
      <p class="footnote">{tr('Your data stays in your workspace. No account required.')}</p>
    </section>
  {:else if screen === 'create'}
    <section class="form-screen" aria-labelledby="create-title">
      <Button variant="back" onclick={changeWorkspace}>{tr('← Back')}</Button>
      <h1 id="create-title">{tr('Create a workspace')}</h1>
      <p class="subtitle">{tr('Choose where your encrypted data will live.')}</p>
      <form onsubmit={createWorkspace}>
        <TextField id="workspace-name" label={tr('Workspace name')} bind:value={workspaceName} maxlength={64} />
        <FolderPicker id="workspace-folder" label={tr('Workspace folder')} bind:value={parentFolder} placeholder={tr('Choose a parent folder…')} onBrowse={chooseParent} />
        {#if destination}<Message kind="info" testId="destination" message={tr('Destination: {destination}', { destination })} />{/if}
        <TextField id="master-password" label={tr('Master password')} type="password" bind:value={password} autocomplete="new-password" required />
        <TextField id="confirm-password" label={tr('Confirm password')} type="password" bind:value={confirmation} autocomplete="new-password" required />
        {#if error}<Message message={error} />{/if}
        <Button variant="primary" className="submit" type="submit" disabled={busy}>{busy ? tr('Creating…') : tr('Create workspace')}</Button>
      </form>
    </section>
  {:else if screen === 'unlock'}
    <section class="form-screen unlock" aria-labelledby="unlock-title">
      <Button variant="back" onclick={changeWorkspace}>{tr('← Choose another workspace')}</Button>
      <h1 id="unlock-title">{tr('Unlock your workspace')}</h1>
      <p class="subtitle">{tr('Enter your master password to continue.')}</p>
      <WorkspaceCard name={opened?.name ?? ''} path={workspacePath} />
      <form onsubmit={unlockWorkspace}>
        <TextField id="unlock-password" label={tr('Master password')} type="password" bind:value={password} autocomplete="current-password" required />
        {#if error}<Message message={error} />{/if}
        <Button variant="primary" className="submit" type="submit" disabled={busy}>{busy ? tr('Unlocking…') : tr('Unlock workspace')}</Button>
      </form>
    </section>
  {:else if screen === 'ready'}
    <section class="client" aria-label={tr('Collections and requests')}>
      <aside class="client-sidebar">
        <div class="client-brand"><Brand /><button class="workspace-switch" onclick={changeWorkspace}>{opened?.name} ▾</button></div>
        <nav class="management-nav" aria-label={tr('Navigation')}>
          <button onclick={() => { managementView = 'collections'; historyVisible = false; }}>{tr('Collections')}</button>
          <button onclick={showHistory}>{tr('History')}</button>
          <button onclick={() => openManagement('environments')}>{tr('Environments')}</button>
          <button onclick={() => openManagement('transfer')}>{tr('Import and export')}</button>
          <button class:active={managementView === 'settings'} onclick={() => openManagement('settings')}>{tr('Settings')}</button>
        </nav>
        {#if managementView === 'collections'}<div class="sidebar-section"><span>{tr('COLLECTIONS')}</span><button aria-label={tr('Add collection')} onclick={addCollection}>＋</button></div>
        <RequestTree
          {collections}
          selectedID={selectedTreeID}
          onSelect={selectRequest}
          onSelectCollection={(node) => selectedTreeID = node.id}
          onRename={renameNode}
          onAddRequest={addRequest}
          onAddFolder={addFolder}
          onRun={runCollection}
          onGenerateCode={generateCodeForRequest}
          onDuplicate={duplicateNode}
          onMove={moveNode}
          onReorder={reorderNode}
          onDelete={removeNode}
          onDropNode={dropTreeNode}
        />
        {/if}
      </aside>
      <div class:management-main={managementView !== 'collections'} class:history-open={managementView === 'collections' && historyVisible} class="client-main">
        {#if managementView === 'collections'}<header class="client-toolbar"><span>{activeRequest ? `${draft.method}  ${draft.name}` : tr('Collections')}</span><div class="environment-control"><button class="environment-switch" aria-label={environments.find((item) => item.id === activeEnvironmentID)?.name ?? tr('Environment')} aria-expanded={environmentMenuOpen} onclick={() => environmentMenuOpen = !environmentMenuOpen}>{environments.find((item) => item.id === activeEnvironmentID)?.name ?? tr('Environment')} ▾</button>{#if environmentMenuOpen}<div class="environment-menu" role="menu" aria-label={tr('Environments')}>{#each environments as environment (environment.id)}<button role="menuitemradio" aria-checked={activeEnvironmentID === environment.id} onclick={() => selectEnvironment(environment.id)}>{environment.name}</button>{/each}<button class="environment-create" role="menuitem" onclick={startEnvironmentCreation}>＋ {tr('New environment')}</button></div>{/if}</div></header>
        {:else if managementView === 'environments'}
          <section class="management-page"><div class="management-heading"><div><h1>{tr('Environments')}</h1><p>{tr('Switch API values without changing your requests.')}</p></div><button class="send-button management-action" onclick={startEnvironmentCreation}>＋ {tr('New environment')}</button></div>
            <div class="environment-layout"><div class="environment-list"><strong>{tr('YOUR ENVIRONMENTS')}</strong>{#each environments as environment (environment.id)}<button class:chosen={managementEnvironmentID === environment.id} onclick={() => showEnvironment(environment.id)}>{environment.name}</button>{/each}<button class="add-environment" onclick={startEnvironmentCreation}>＋ {tr('Add environment')}</button></div>
            <div class="environment-editor">{#if environments.find((item) => item.id === managementEnvironmentID)}<div class="environment-editor-heading"><div><h2>{environments.find((item) => item.id === managementEnvironmentID)?.name}</h2><p>{tr('Stored in this workspace')}</p></div><button aria-label={tr('Delete environment')} onclick={() => environmentToDelete = managementEnvironmentID}>×</button></div><KeyValueTable showTypes ariaLabel={tr('Environment variables')} itemName={tr('Variable')} addLabel={tr('Add variable')} rows={managementRows} onChange={(rows) => managementRows = rows} /><div class="environment-footer"><span>{tr('Values stay encrypted in this workspace.')}</span><button class="save-button" onclick={saveManagementEnvironment}>{tr('Save changes')}</button></div>{/if}</div></div>
          </section>
        {:else if managementView === 'transfer'}
          <section class="management-page"><div class="management-heading"><div><h1>{tr('Import and export')}</h1><p>{tr('Move collections and environments using a local file.')}</p></div></div><div class="transfer-grid"><div class="transfer-card"><span class="transfer-icon">↓</span><h2>{tr('Import from Postman')}</h2><p>{tr('Bring in a collection or environment. Review it before adding it to your workspace.')}</p><label class="transfer-drop">{tr('Choose a Postman JSON file')}<input aria-label={tr('Import Postman file')} type="file" accept="application/json,.json" onchange={choosePostmanFile} /></label></div><div class="transfer-card"><span class="transfer-icon">↑</span><h2>{tr('Export to Postman')}</h2><p>{tr('Choose what to export and save a JSON file on this device.')}</p><label for="export-selection">{tr('Items to export')}</label><Select id="export-selection" label={tr('Items to export')} className="full-width-select" value={exportSelection} options={[{ value: 'collections', label: tr('Collections') }, ...environments.map((environment) => ({ value: environment.id, label: environment.name }))]} onChange={(value) => exportSelection = value} /><label for="export-format">{tr('Format')}</label><Select id="export-format" label={tr('Format')} className="full-width-select" value="Postman JSON" options={[{ value: 'Postman JSON', label: 'Postman JSON' }]} /><button class="send-button management-action" onclick={() => { if (exportSelection === 'collections') exportCollection(); else { const environment = environments.find((item) => item.id === exportSelection); if (environment) exportEnvironment(environment); } }}>{tr('Export file')}</button></div></div></section>
        {:else}
          <SettingsScreen locale={$locale} timeoutSeconds={appSettings.timeoutSeconds} themePreference={appSettings.theme} onLocaleChange={changeLocale} onTimeoutChange={(seconds) => { appSettings.timeoutSeconds = seconds; saveSettings(); }} onThemeChange={changeTheme} onChangePassword={() => { settingsError = ''; changingPassword = true; }} />
        {/if}
        {#if managementView === 'collections'}{#if historyVisible}<section class="history-view" aria-labelledby="history-title"><div class="history-heading"><div><h1 id="history-title">{tr('History')}</h1><p>{tr('Your recent requests, stored in this workspace.')}</p></div><button class="history-clear" disabled={!requestHistory.length} onclick={() => dialogKind = 'clear-history'}>{tr('Clear history')}</button></div>{#if historyError}<p class="history-error" role="alert">{historyError}</p>{/if}{#if requestHistory.length}<div class="history-list" aria-label={tr('Recent requests')}>{#each requestHistory as item, index (`${item.timestamp}-${index}`)}<div class="history-item"><button class="history-entry" onclick={() => { historyVisible = false; }}><span class="history-method method-{item.method.toLowerCase()}">{item.method}</span><span class="history-summary">{item.name} · {item.status || item.error}<small>{item.method} {item.url}</small><small>{new Date(item.timestamp).toLocaleString()}</small></span></button><button class="history-remove" aria-label={tr('Remove {name} from history', { name: item.name })} onclick={() => { historyEntryToRemove = { index, name: item.name }; dialogKind = 'remove-history'; }}>×</button></div>{/each}</div>{:else}<p class="history-empty">{tr('No requests yet.')}</p>{/if}</section>
        {:else if runResults.length}<section class="history-view"><div class="history-heading"><h1>{tr('Collection run')}</h1><button class="save-button" onclick={() => runResults = []}>{tr('Back to collections')}</button></div>{#each runResults as result (`${result.name}-${result.status}`)}<p class="history-item">{result.name} · {result.status}</p>{/each}</section>
        {:else if activeRequest}
          <div class="request-editor">
            <div class="editor-heading"><input aria-label={tr('Request name')} bind:value={draft.name} /><div><button class="code-action" aria-label={tr('Generate code')} title={tr('Generate code')} onclick={generateCode}>&lt;/&gt;</button><button class="save-button" disabled={requestBusy || savingBusy} aria-busy={savingBusy} onclick={saveRequest}>{savingBusy ? tr('Saving…') : saved ? tr('Saved') : tr('Save')}</button></div></div>
            <div class="send-row"><Select id="http-method" label={tr('HTTP method')} className="method-select" value={draft.method} options={['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map((method) => ({ value: method, label: method }))} onChange={(value) => draft.method = value} /><div class="request-url-field"><input id="request-url-input" aria-label={tr('Request URL')} placeholder="https://api.example.com/resource" bind:value={draft.url} oninput={trackURLVariableInput} />{#if urlVariablePrefix !== null}{#each Object.keys(selectedEnvironment()?.values ?? {}).filter((key) => key.toLowerCase().includes((urlVariablePrefix ?? '').toLowerCase())) as variable}<button type="button" class="variable-suggestion" style={`left: ${urlSuggestionOffset}px`} onmousedown={(event) => event.preventDefault()} onpointerdown={(event) => { event.preventDefault(); insertURLVariable(variable); }} onclick={() => insertURLVariable(variable)}>{`{{${variable}}}`}</button>{/each}{/if}</div><button class="send-button" disabled={requestBusy} aria-busy={requestBusy} onclick={sendRequest}>{requestBusy ? tr('Sending…') : tr('Send →')}</button></div><datalist id="environment-variable-suggestions">{#each Object.keys(selectedEnvironment()?.values ?? {}) as variable}<option value={`{{${variable}}}`}>{variable}</option>{/each}</datalist>
            <div class="editor-tabs">{#each ['Params','Headers','Auth','Body','Pre-request','Post-response','Tests'] as tab}<button class:selected={requestTab === tab} onclick={() => requestTab = tab}>{tr(tab)}</button>{/each}</div>
            {#if requestTab === 'Params'}<section class="request-table-panel"><div class="request-table-title">{tr('QUERY PARAMETERS')} <span>{queryRows.filter((row) => row.enabled && row.key.trim()).length}{tr(' enabled')}</span></div><KeyValueTable ariaLabel="Query parameters" itemName="Parameter" addLabel="Add parameter" rows={queryRows} suggestions={Object.keys(selectedEnvironment()?.values ?? {}).map((key) => `{{${key}}}`)} onChange={(rows) => queryRows = rows} /></section>
            {:else if requestTab === 'Headers'}<section class="request-table-panel"><div class="request-table-title">{tr('REQUEST HEADERS')} <span>{headerRows.filter((row) => row.enabled && row.key.trim()).length}{tr(' enabled')}</span></div><KeyValueTable ariaLabel="Request headers" itemName="Header" addLabel="Add header" rows={headerRows} suggestions={Object.keys(selectedEnvironment()?.values ?? {}).map((key) => `{{${key}}}`)} onChange={(rows) => headerRows = rows} /></section>
            {:else if requestTab === 'Auth'}<div class="auth-panel"><div class="auth-type-row"><label for="auth-type">{tr('AUTHENTICATION TYPE')}</label><Select id="auth-type" label={tr('Authentication type')} className="auth-type-select" value={authType} options={[{ value: 'none', label: tr('No authentication') }, { value: 'bearer', label: tr('Bearer token') }, { value: 'basic', label: tr('Basic auth') }]} onChange={(value) => authType = value} /></div>{#if authType !== 'none'}<table class="auth-credentials" aria-label={tr('Authentication credentials')}><thead><tr><th>{tr('Field')}</th><th>{tr('Value')}</th><th></th></tr></thead><tbody>{#if authType === 'bearer'}<tr><th scope="row">{tr('Token')}</th><td><input aria-label={tr('Bearer token')} list="environment-variable-suggestions" type="password" bind:value={authToken} /></td><td><button aria-label={tr('Clear token')} onclick={() => pendingCredentialRemoval = () => { authToken = ''; }}>×</button></td></tr><tr><th scope="row">{tr('Add to')}</th><td colspan="2">{tr('Authorization header')}</td></tr>{:else}<tr><th scope="row">{tr('Username')}</th><td><input id="auth-username" list="environment-variable-suggestions" aria-label={tr('Username')} bind:value={authUsername} /></td><td></td></tr><tr><th scope="row">{tr('Password')}</th><td><input id="auth-password" list="environment-variable-suggestions" aria-label={tr('Password')} type="password" bind:value={authPassword} /></td><td></td></tr>{/if}{#each authCredentialRows as credential, index (credential.id)}<tr><th scope="row"><input list="environment-variable-suggestions" aria-label={tr('Credential key {number}', { number: index + 1 })} value={credential.key} oninput={(event) => updateAuthCredential(credential.id, 'key', event.currentTarget.value)} /></th><td><input list="environment-variable-suggestions" aria-label={tr('Credential value {number}', { number: index + 1 })} value={credential.value} oninput={(event) => updateAuthCredential(credential.id, 'value', event.currentTarget.value)} /></td><td><input type="checkbox" aria-label={tr('Enable credential {number}', { number: index + 1 })} checked={credential.enabled} onchange={(event) => updateAuthCredential(credential.id, 'enabled', event.currentTarget.checked)} /><button aria-label={tr('Remove credential {number}', { number: index + 1 })} onclick={() => pendingCredentialRemoval = () => removeAuthCredential(credential.id)}>×</button></td></tr>{/each}</tbody></table><button class="key-value-add" onclick={addAuthCredential}>＋ {tr('Add credential')}</button>{/if}</div>
            {:else if requestTab === 'Pre-request'}<label class="body-label" for="pre-request-script">{tr('JavaScript · runs before sending')}</label><p class="script-help">{tr('Pre-request help')}</p><textarea id="pre-request-script" class="body-editor" placeholder={'const payload = JSON.parse(request.body || "{}");\nconst userId = payload.userId || environment.userId;\nif (userId) request.headers["X-User-Id"] = String(userId);'} bind:value={preRequestScript}></textarea>
            {:else if requestTab === 'Post-response'}<label class="body-label" for="post-response-script">{tr('JavaScript · runs after response')}</label><p class="script-help">{tr('Post-response help')}</p><textarea id="post-response-script" class="body-editor" placeholder={'const data = JSON.parse(response.body || "{}");\nif (data.access_token) environment.accessToken = String(data.access_token);'} bind:value={postResponseScript}></textarea>
            {:else if requestTab === 'Tests'}<label class="body-label" for="test-script">{tr('JavaScript tests')}</label><p class="script-help">{tr('Tests help')}</p><textarea id="test-script" class="body-editor" placeholder={'const data = JSON.parse(response.body || "{}");\nif (response.status !== 200 || !data.id) {\n  throw new Error("Expected a successful response with an ID");\n}'} bind:value={testScript}></textarea>
            {:else}<div class="body-label">{tr('Body type')} <Select id="body-type" label={tr('Body type')} className="body-type-select" value={bodyType} options={[{ value: 'JSON', label: 'JSON' }, { value: 'Text', label: tr('Text') }, { value: 'Form URL-encoded', label: tr('Form URL-encoded') }, { value: 'Multipart', label: 'Multipart' }, { value: 'Binary file', label: tr('Binary file') }]} onChange={(value) => bodyType = value} />{#if bodyType === 'JSON'}<button class="format-json" onclick={formatRequestJSON}>{tr('Format JSON')}</button>{/if}</div>{#if bodyType === 'Binary file'}<div class="file-picker"><button class="save-button" onclick={chooseRequestFile}>{tr('Choose file')}</button><span>{filePath || tr('No file selected')}</span></div>{:else}<textarea id="request-body-editor" class="body-editor" aria-label={tr('Request body')} placeholder={tr(bodyType === 'Multipart' ? 'JSON text fields, e.g. {"name":"Ada"}' : 'Enter request body')} value={draft.body} oninput={trackBodyVariableInput} spellcheck="false"></textarea>{#if bodyVariablePrefix !== null}{#each Object.keys(selectedEnvironment()?.values ?? {}).filter((key) => key.toLowerCase().includes((bodyVariablePrefix ?? '').toLowerCase())) as variable}<button type="button" class="variable-suggestion" onmousedown={(event) => event.preventDefault()} onpointerdown={(event) => { event.preventDefault(); insertBodyVariable(variable); }} onclick={() => insertBodyVariable(variable)}>{`{{${variable}}}`}</button>{/each}{/if}{#if bodyType === 'Multipart'}<MultipartFileTable rows={multipartFiles} onChange={(rows) => multipartFiles = rows} onChooseFile={chooseMultipartFile} />{/if}{/if}{/if}
          </div>
          <ResponsePanel
            {response}
            requestHeaders={sentRequestHeaders}
            requestLine={sentRequestLine}
            requestURL={sentRequestURL}
            {responseTab}
            {requestBusy}
            {requestError}
            onTabChange={(tab) => responseTab = tab}
            onLanguageChange={updateCode}
            onRetry={sendRequest}
          />
          {#if codeModalOpen}<div class="app-dialog-overlay code-modal-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) codeModalOpen = false; }}><dialog open class="code-modal" aria-modal="true" aria-labelledby="generated-code-title"><header><h2 id="generated-code-title">{tr('Generated code')}</h2><button class="response-toggle" aria-label={tr('Close')} onclick={() => codeModalOpen = false}>×</button></header><div class="code-language"><span>{tr('Language')}</span><Select id="code-language" label={tr('Code language')} className="language-select" value={codeLanguage} options={codeLanguages.map((language) => ({ value: language, label: language }))} onChange={(language) => { codeLanguage = language; updateCode(language); }} /></div><pre class="response-content">{code}</pre></dialog></div>{/if}
        {:else}<div class="empty-workspace"><h1>{tr('Your workspace is ready')}</h1><p>{tr('Create a collection to organize your requests.')}</p><button class="send-button" onclick={addCollection}>＋ {tr('New collection')}</button></div>{/if}
        {/if}
      </div>
      {#if movingNode}<div class="move-overlay"><dialog open class="move-dialog" aria-modal="true" aria-labelledby="move-title"><h2 id="move-title">{tr('Move {name}', { name: movingNode.name })}</h2><label for="move-destination">{tr('Destination')}</label><Select id="move-destination" label={tr('Move destination')} className="full-width-select" value={moveTargetID} options={moveDestinations.map((destination) => ({ value: destination.id, label: destination.name }))} onChange={(value) => moveTargetID = value} /><div class="move-actions"><button class="secondary" onclick={() => movingNode = null}>{tr('Cancel')}</button><button class="send-button" disabled={!moveTargetID} onclick={confirmMove}>{tr('Move request')}</button></div></dialog></div>{/if}
      {#if environmentToDelete}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-environment-title"><h2 id="delete-environment-title">{tr('Delete environment')}</h2><p>{tr('Delete “{name}”?', {name: environments.find((item) => item.id === environmentToDelete)?.name ?? ''})}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => environmentToDelete = ''}>{tr('Cancel')}</button><button class="danger-button" onclick={async () => { await removeEnvironment(environmentToDelete); environmentToDelete = ''; showEnvironment(environments[0]?.id ?? ''); }}>{tr('Delete')}</button></div></div></div>{/if}
      {#if pendingCredentialRemoval}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-credential-title"><h2 id="delete-credential-title">{tr('Remove credential')}</h2><p>{tr('Remove this credential?')}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => pendingCredentialRemoval = null}>{tr('Cancel')}</button><button class="danger-button" onclick={() => { pendingCredentialRemoval?.(); pendingCredentialRemoval = null; }}>{tr('Remove')}</button></div></div></div>{/if}
      {#if dialogKind === 'rename' && renameTarget}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title"><h2 id="rename-dialog-title">{tr('Rename item')}</h2><label for="item-name">{tr('Name')}</label><input id="item-name" aria-label={tr('Item name')} bind:value={dialogName} /><div class="app-dialog-actions"><button class="secondary" onclick={() => { dialogKind = null; renameTarget = null; }}>{tr('Cancel')}</button><button class="send-button" onclick={saveRename}>{tr('Rename')}</button></div></div></div>{/if}
      {#if dialogKind === 'delete' && deleteTarget}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title"><h2 id="delete-dialog-title">{tr('Delete item')}</h2><p>{tr('Delete “{name}” and its contents?', { name: deleteTarget.name })}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => { dialogKind = null; deleteTarget = null; }}>{tr('Cancel')}</button><button class="danger-button" onclick={confirmDelete}>{tr('Delete item')}</button></div></div></div>{/if}
      {#if dialogKind === 'unsaved'}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title"><h2 id="unsaved-dialog-title">{tr('Unsaved request')}</h2><p>{tr('Save changes before leaving this request?')}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => resolveLeave('stay')}>{tr('Stay here')}</button><button class="danger-button" onclick={() => resolveLeave('discard')}>{tr('Discard changes')}</button><button class="send-button" onclick={() => resolveLeave('save')}>{tr('Save and continue')}</button></div></div></div>{/if}
      {#if dialogKind === 'clear-history'}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-history-title"><h2 id="clear-history-title">{tr('Clear request history?')}</h2><p>{tr('This removes all {number} entries from this workspace.', { number: requestHistory.length })} {tr('This action cannot be undone.')}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => dialogKind = null}>{tr('Cancel')}</button><button class="danger-button" onclick={clearHistory}>{tr('Clear history')}</button></div></div></div>{/if}
      {#if dialogKind === 'remove-history' && historyEntryToRemove}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-history-title"><h2 id="remove-history-title">{tr('Remove history item?')}</h2><p>{tr('Remove “{name}” from history?', { name: historyEntryToRemove.name })} {tr('This action cannot be undone.')}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => { dialogKind = null; historyEntryToRemove = null; }}>{tr('Cancel')}</button><button class="danger-button" onclick={confirmHistoryEntryRemoval}>{tr('Remove')}</button></div></div></div>{/if}
      {#if pendingImport}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="import-review-title"><h2 id="import-review-title">{tr('Review import')}</h2><p>{pendingImport.name}</p><p>{importSummary}</p><p>{tr('Imported data stays in this workspace.')}</p><div class="app-dialog-actions"><button class="secondary" onclick={() => pendingImport = null}>{tr('Cancel')}</button><button class="send-button" onclick={importPostmanFile}>{tr('Import')}</button></div></div></div>{/if}
      {#if changingPassword}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title"><h2 id="password-dialog-title">{tr('Change workspace password')}</h2><form onsubmit={changeWorkspacePassword}><label for="current-workspace-password">{tr('Current password')}</label><input id="current-workspace-password" type="password" bind:value={currentPassword} required /><label for="new-workspace-password">{tr('New password')}</label><input id="new-workspace-password" type="password" bind:value={newPassword} required /><label for="confirm-workspace-password">{tr('Confirm password')}</label><input id="confirm-workspace-password" type="password" bind:value={passwordConfirmation} required />{#if settingsError}<p class="dialog-error" role="alert">{settingsError}</p>{/if}<div class="app-dialog-actions"><button type="button" class="secondary" onclick={() => changingPassword = false}>{tr('Cancel')}</button><button type="submit" class="send-button">{tr('Save changes')}</button></div></form></div></div>{/if}
      {#if dialogKind === 'environment'}<div class="app-dialog-overlay"><div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="environment-dialog-title"><h2 id="environment-dialog-title">{editingEnvironmentID ? tr('Edit environment') : tr('New environment')}</h2><label for="environment-name">{tr('Environment name')}</label><input id="environment-name" bind:value={dialogName} />{#if managementView === 'environments'}<label for="duplicate-environment">{tr('Start with values from')}</label><Select id="duplicate-environment" label={tr('Start with values from')} className="full-width-select" value={duplicateEnvironmentID} options={[{ value: '', label: tr('Blank environment') }, ...environments.map((environment) => ({ value: environment.id, label: environment.name }))]} onChange={(value) => duplicateEnvironmentID = value} />{:else}<KeyValueTable ariaLabel={tr('Environment variables')} itemName={tr('Variable')} addLabel={tr('Add variable')} rows={environmentRows} onChange={(rows) => environmentRows = rows} />{/if}{#if dialogError}<p class="dialog-error" role="alert">{dialogError}</p>{/if}<div class="app-dialog-actions"><button class="secondary" onclick={() => { dialogKind = null; editingEnvironmentID = ''; }}>{tr('Cancel')}</button><button class="send-button" onclick={saveEnvironment}>{editingEnvironmentID ? tr('Save') : tr('Create environment')}</button></div></div></div>{/if}
    </section>
  {/if}
{/key}</main>
