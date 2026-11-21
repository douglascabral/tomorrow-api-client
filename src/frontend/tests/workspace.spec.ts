import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

type Workspace = { path: string; name: string; data: { collections: never[]; requests: never[]; environments: never[] } };
type SavedRequest = {
  url?: string;
  query?: Record<string, string>;
  authCredentials?: Array<{ key: string; value: string }>;
  headers?: Record<string, string>;
  headerRows?: Array<{ enabled: boolean }>;
};
type MockAPI = {
  SelectFolder: () => Promise<string>;
  CreateWorkspace: (parent: string, name: string, password: string, confirmation: string) => Promise<Workspace>;
  OpenWorkspace: (path: string, password: string) => Promise<Workspace>;
  Collections: () => Promise<Array<{ id: string; name: string; kind: string; method?: string; url?: string; body?: string; headers?: Record<string, string>; children?: unknown[] }>>;
  SaveCollections: (collections: string) => Promise<void>;
  Environments: () => Promise<Array<{ id: string; name: string; values: Record<string, string> }>>;
  SaveEnvironments: (environments: string) => Promise<void>;
  SavePostmanExport: (filename: string, contents: string) => Promise<void>;
  SendRequest: (request: string) => Promise<{ statusCode: number; status: string; headers: Record<string, string>; body: string; durationMs: number; environment?: Record<string, string> }>;
  RequestHistory: () => Promise<Array<{ name: string; method: string; url: string; status: number; timestamp: string }>>;
  RemoveHistoryEntry: (index: number) => Promise<void>;
  ClearHistory: () => Promise<void>;
  SelectFile: () => Promise<string>;
  SelectFiles: () => Promise<string[]>;
  ChangePassword: (current: string, next: string, confirmation: string) => Promise<void>;
};

declare global {
  interface Window { __TOMORROW_API__?: MockAPI; lastPostmanExport?: { filename: string; contents: string } }
interface Window { __TOMORROW_TIMEOUTS__?: number[] }
}

const workspacePath = fileURLToPath(new URL('./fixtures/workspace/Personal', import.meta.url));
const payloadFixture = fileURLToPath(new URL('./fixtures/payload.bin', import.meta.url));
const avatarFixture = fileURLToPath(new URL('./fixtures/avatar.png', import.meta.url));
const avatarSmallFixture = fileURLToPath(new URL('./fixtures/avatar-small.png', import.meta.url));
async function unlockWithPassword(page: Page, password: string) {
  await page.getByLabel('Master password').fill(password);
  await clickButton(page, 'Unlock workspace');
}

async function clickButton(page: Page, name: string) {
  await page.getByRole('button', { name }).click();
}

async function startWorkspaceCreation(page: Page) {
  await clickButton(page, 'Create workspace');
  await clickButton(page, 'Browse');
}

async function expectWelcomeScreen(page: Page) {
  await expect(page.getByRole('heading', { name: 'Your API workspace, on your terms.' })).toBeVisible();
}

async function validateWorkspacePasswordConfirmation(page: Page, labels: { password: string; confirmation: string; submit: string; mismatch: string }) {
  await page.getByLabel(labels.password).fill('safe pass');
  await page.getByLabel(labels.confirmation).fill('different');
  await clickButton(page, labels.submit);
  await expect(page.getByRole('alert')).toHaveText(labels.mismatch);
  await page.getByLabel(labels.confirmation).fill('safe pass');
  await clickButton(page, labels.submit);
}

async function chooseTreeAction(page: Page, itemName: string, actionName: string) {
  await openTreeActions(page, itemName);
  await page.getByRole('menuitem', { name: actionName }).click();
}

async function openTreeActions(page: Page, itemName: string) {
  await clickButton(page, `Actions for ${itemName}`);
}

async function openSettings(page: Page) {
  await enterExistingWorkspace(page);
  await clickButton(page, 'Settings');
}

async function sendRequest(page: Page, url: string) {
  await fillRequestURL(page, url);
  await clickButton(page, 'Send →');
}

async function selectTheme(page: Page, label: string, option: string, expected: string) {
  await chooseOption(page, label, option);
  await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
}

async function expectClientBackground(page: Page, color: string) {
  await expect.poll(() => page.locator('.client').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(color);
}

async function openHistory(page: Page) {
  await clickButton(page, 'History');
}

async function openEnvironments(page: Page) {
  await enterExistingWorkspace(page);
  await page.getByRole('button', { name: 'Environments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Environments' })).toBeVisible();
}

async function returnToEnvironments(page: Page) {
  await page.getByRole('button', { name: 'Import and export' }).click();
  await page.getByRole('button', { name: 'Environments', exact: true }).click();
}

async function openBodyTab(page: Page) {
  await openRequestTab(page, 'Body');
}

async function openRequestTab(page: Page, tab: string) {
  await page.locator('.editor-tabs').getByRole('button', { name: tab }).click();
}

async function createEnvironmentVariable(page: Page, name: string, key: string, value: string) {
  await page.locator('.client-toolbar').getByRole('button', { name: 'Development' }).click();
  await page.getByRole('menuitem', { name: 'New environment' }).click();
  await page.getByLabel('Environment name').fill(name);
  await clickButton(page, 'Add variable');
  await page.getByLabel('Variable key 1').fill(key);
  await page.getByLabel('Variable value 1').fill(value);
  await clickButton(page, 'Create environment');
}

async function selectURLVariableAtCursor(page: Page) {
  const requestURL = page.getByRole('textbox', { name: 'Request URL' });
  await requestURL.fill('https://api.example.test//users');
  await requestURL.evaluate((input: HTMLInputElement) => input.setSelectionRange(input.value.indexOf('/users'), input.value.indexOf('/users')));
  await requestURL.pressSequentially('{{ba');
  const suggestion = page.getByRole('button', { name: '{{baseUrl}}' });
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toHaveAttribute('style', /left:\s*[1-9]\d*(?:\.\d+)?px/);
  await suggestion.click();
  await expect(requestURL).toHaveValue('https://api.example.test/{{baseUrl}}/users');
  await expect(page.getByLabel('Variables in request URL')).toHaveCount(0);
  await fillRequestURL(page, '{{baseUrl}}/users');
}

async function selectBodyVariableAtCursor(page: Page) {
  const body = page.getByLabel('Request body');
  await body.fill('{"url":"{{b","next":"ok"}');
  await body.evaluate((input: HTMLTextAreaElement) => {
    const cursor = input.value.indexOf('b') + 1;
    input.setSelectionRange(cursor, cursor);
  });
  await body.pressSequentially('a');
  await page.getByRole('button', { name: '{{baseUrl}}' }).click();
  await expect(body).toHaveValue('{"url":"{{baseUrl}}","next":"ok"}');
}

async function exportPostmanJSON(page: Page, expectedFilename: string) {
  await clickButton(page, 'Export file');
  const exported = await page.evaluate(() => {
    return window.lastPostmanExport;
  });
  expect(exported?.filename).toBe(expectedFilename);
  return JSON.parse(exported?.contents ?? '{}') as Record<string, unknown>;
}

async function setSystemLanguage(page: Page, language: string) {
  await page.addInitScript((value) => {
    Object.defineProperty(navigator, 'language', { configurable: true, value });
  }, language);
  await page.reload();
}

function dismissNativeDialogs(page: Page) {
  const dialogTypes: string[] = [];
  page.on('dialog', (dialog) => { dialogTypes.push(dialog.type); void dialog.dismiss(); });
  return dialogTypes;
}

async function chooseOption(page: Page, label: string, option: string, index = 0) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).nth(index).click();
}

async function expectCodeLanguage(page: Page, language: string, snippets: string[]) {
  await chooseOption(page, 'Code language', language);
  for (const snippet of snippets) await expect(page.locator('.response-content')).toContainText(snippet);
}

async function enterExistingWorkspace(page: Page) {
  await clickButton(page, 'Choose workspace');
  await unlockWithPassword(page, 'safe pass');
}

async function createRequest(page: Page) {
  await enterExistingWorkspace(page);
  await clickButton(page, 'Add collection');
  await chooseTreeAction(page, 'New collection', 'Add request');
}

async function prepareRequest(page: Page, url: string) {
  await createRequest(page);
  await fillRequestURL(page, url);
}

async function createAndSendRequest(page: Page, url: string) {
  await prepareRequest(page, url);
  await clickButton(page, 'Send →');
}

async function fillRequestURL(page: Page, url: string) {
  await page.getByRole('textbox', { name: 'Request URL' }).fill(url);
}

async function firstSavedRequest(page: Page): Promise<SavedRequest | undefined> {
  return page.evaluate(async () => {
    const collections = await window.__TOMORROW_API__?.Collections();
    return collections?.[0]?.children?.[0] as SavedRequest | undefined;
  });
}

async function collectionTreeNames(page: Page) {
  const names = await page.locator('.tree-item').allTextContents();
  return names.map((name) => name.replace(/\s+/g, ''));
}

async function expectMenuToCloseOnRequestURLClick(page: Page, name: string) {
  await page.getByLabel('Request URL').click();
  await expect(page.getByRole('menu', { name })).toHaveCount(0);
}

async function setPostmanEnvironmentFile(page: Page, fileName: string, key: string, value: string) {
  await page.getByLabel('Import Postman file').setInputFiles({
    name: fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ name: 'QA', values: [{ key, value, enabled: true }] })),
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ targetPath, payloadFixture, avatarFixture, avatarSmallFixture }) => {
    window.__TOMORROW_TIMEOUTS__ = [];
    let masterPassword = 'safe pass';
    let collections: Array<{ id: string; name: string; kind: string; method?: string; url?: string; body?: string; headers?: Record<string, string>; children?: Array<unknown> }> = [];
    let environments: Array<{ id: string; name: string; values: Record<string, string> }> = [];
    const history: Array<{ name: string; method: string; url: string; status: number; timestamp: string }> = [];
    const openedWorkspace = (path: string, name: string) => ({
      path,
      name,
      data: { collections: [], requests: [], environments: [] },
    });
    window.__TOMORROW_API__ = {
      SelectFolder: async () => targetPath,
      CreateWorkspace: async (_parent, name, password, confirmation) => {
        if (password !== confirmation) throw new Error('password confirmation does not match');
        if (password === '') throw new Error('password is required');
        return openedWorkspace(`${targetPath.replace(/\/Personal$/, '')}/${name}`, name);
      },
      OpenWorkspace: async (path, password) => {
        if (password !== masterPassword) throw new Error('workspace is invalid or password is incorrect');
        return openedWorkspace(path, path.split('/').pop() ?? path);
      },
      ChangePassword: async (current, next, confirmation) => {
        if (current !== masterPassword) throw new Error('workspace is invalid or password is incorrect');
        if (!next) throw new Error('password is required');
        if (next !== confirmation) throw new Error('password confirmation does not match');
        masterPassword = next;
      },
      Collections: async () => collections,
      Environments: async () => environments,
      SaveEnvironments: async (value) => { environments = JSON.parse(value) as typeof environments; },
      SavePostmanExport: async (filename, contents) => { window.lastPostmanExport = { filename, contents }; },
      RequestHistory: async () => history.map((entry) => ({ ...entry })),
      RemoveHistoryEntry: async (index) => { history.splice(index, 1); },
      ClearHistory: async () => { history.splice(0, history.length); },
      SelectFile: async () => payloadFixture,
      SelectFiles: async () => [avatarFixture, avatarSmallFixture],
      SaveCollections: async (value) => { collections = JSON.parse(value) as typeof collections; },
      SendRequest: async (requestJSON) => {
        const request = JSON.parse(requestJSON) as { name: string; method: string; url: string; timeoutSeconds: number };
        window.__TOMORROW_TIMEOUTS__?.push(request.timeoutSeconds);
        history.unshift({ name: request.name, method: request.method, url: request.url, status: 200, timestamp: new Date().toISOString() });
        return { statusCode: 200, status: '200 OK', headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'session=local; HttpOnly' }, body: '{"ok":true}', durationMs: 3 };
      },
    };
  }, { targetPath: workspacePath, payloadFixture, avatarFixture, avatarSmallFixture });
  await page.goto('/');
});

test('opens settings and changes the application language', async ({ page }) => {
  await openSettings(page);
  const transferNavigation = page.getByRole('button', { name: 'Import and export' });
  const settingsNavigation = page.getByRole('button', { name: 'Settings' });
  const transferBounds = await transferNavigation.boundingBox();
  const settingsBounds = await settingsNavigation.boundingBox();
  expect(transferBounds).not.toBeNull();
  expect(settingsBounds).not.toBeNull();
  expect(settingsBounds!.y - (transferBounds!.y + transferBounds!.height)).toBeLessThan(24);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await chooseOption(page, 'Language', 'Português (Brasil)');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await selectTheme(page, 'Aparência', 'Alto contraste', 'high-contrast');
});

test('appearance preference switches themes and persists locally', async ({ page }) => {
  await openSettings(page);
  await selectTheme(page, 'Appearance', 'Light', 'light');
  await expectClientBackground(page, 'rgb(246, 248, 251)');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tomorrow.settings.v1') ?? '{}').theme)).toBe('light');
  await clickButton(page, 'Environments');
  await expect.poll(() => page.locator('.environment-editor .key-value-editor').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(241, 244, 248)');
  await clickButton(page, 'Settings');
  await selectTheme(page, 'Appearance', 'High contrast', 'high-contrast');
  await expectClientBackground(page, 'rgb(255, 255, 255)');
  await page.getByRole('combobox', { name: 'Appearance' }).click();
  const systemThemeOption = page.getByRole('option', { name: 'System' });
  await systemThemeOption.hover();
  await expect.poll(() => systemThemeOption.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(232, 232, 232)');
  await expect.poll(() => systemThemeOption.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(0, 0, 0)');
  await page.keyboard.press('Escape');
  await selectTheme(page, 'Appearance', 'Dark', 'dark');
  await chooseOption(page, 'Appearance', 'Light');

  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('combobox', { name: 'Appearance' })).toContainText('Light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('multipart file editor follows the light theme', async ({ page }) => {
  await openSettings(page);
  await selectTheme(page, 'Appearance', 'Light', 'light');
  await page.getByRole('button', { name: 'Collections', exact: true }).click();
  await clickButton(page, 'Add collection');
  await chooseTreeAction(page, 'New collection', 'Add request');
  await openBodyTab(page);
  await chooseOption(page, 'Body type', 'Multipart');
  const editor = page.locator('.multipart-file-editor');
  await clickButton(page, 'Add file field');
  await expect.poll(() => editor.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(241, 244, 248)');
  await expect.poll(() => editor.getByRole('button', { name: 'Choose files for field 1' }).evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
});

test('system appearance follows operating system color scheme changes', async ({ page }) => {
  await openSettings(page);
  await chooseOption(page, 'Appearance', 'System');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectClientBackground(page, 'rgb(11, 17, 27)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectClientBackground(page, 'rgb(246, 248, 251)');
});

test('applies the saved request timeout when sending', async ({ page }) => {
  await openSettings(page);
  await chooseOption(page, 'Request timeout', '60 seconds');
  await clickButton(page, 'Collections');
  await clickButton(page, 'Add collection');
  await chooseTreeAction(page, 'New collection', 'Add request');
  await sendRequest(page, 'https://example.test');
  await expect.poll(() => page.evaluate(() => window.__TOMORROW_TIMEOUTS__)).toEqual([60]);
});

test('changes the workspace password through Settings', async ({ page }) => {
  await openSettings(page);
  await clickButton(page, 'Change password');
  await page.getByLabel('Current password').fill('safe pass');
  await page.getByLabel('New password').fill('new safe pass');
  await page.getByLabel('Confirm password').fill('new safe pass');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('uses Brazilian Portuguese when the system locale is Portuguese', async ({ page }) => {
  await setSystemLanguage(page, 'pt-BR');

  await expect(page.getByRole('heading', { name: 'Seu espaço de trabalho de API, do seu jeito.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('button', { name: 'Criar espaço de trabalho' })).toBeVisible();
});

test('falls back to English for unsupported system locales', async ({ page }) => {
  await setSystemLanguage(page, 'fr-FR');

  await expect(page.getByRole('heading', { name: 'Your API workspace, on your terms.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('aligns choice card descriptions and actions when titles wrap', async ({ page }) => {
  await setSystemLanguage(page, 'pt-BR');
  const cards = page.locator('.choice-card');
  const firstDescription = await cards.nth(0).locator('p').boundingBox();
  const secondDescription = await cards.nth(1).locator('p').boundingBox();
  const firstAction = await cards.nth(0).getByRole('button').boundingBox();
  const secondAction = await cards.nth(1).getByRole('button').boundingBox();

  expect(firstDescription).not.toBeNull();
  expect(secondDescription).not.toBeNull();
  expect(firstAction).not.toBeNull();
  expect(secondAction).not.toBeNull();
  expect(Math.abs(firstDescription!.y - secondDescription!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstAction!.y - secondAction!.y)).toBeLessThanOrEqual(1);
});

test('keeps the open workspace button label clear of its edges', async ({ page }) => {
  await setSystemLanguage(page, 'pt-BR');
  const button = page.locator('.choice-card').nth(1).getByRole('button');
  const horizontalClearance = await button.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return Math.min(text.left - bounds.left, bounds.right - text.right);
  });

  expect(horizontalClearance).toBeGreaterThanOrEqual(10);
});

test('localizes the workspace creation flow and validation in Brazilian Portuguese', async ({ page }) => {
  await setSystemLanguage(page, 'pt');
  await clickButton(page, 'Criar espaço de trabalho');
  await clickButton(page, 'Procurar');

  await expect(page.getByLabel('Nome do espaço de trabalho')).toBeVisible();
  await validateWorkspacePasswordConfirmation(page, {
    password: 'Senha principal',
    confirmation: 'Confirme a senha',
    submit: 'Criar espaço de trabalho',
    mismatch: 'As senhas não coincidem.',
  });
  await clickButton(page, 'Adicionar coleção');
  await page.getByRole('button', { name: 'Ações para Nova coleção' }).click();
  await expect(page.getByRole('menuitem', { name: 'Adicionar requisição' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Adicionar requisição' }).click();
  await page.getByRole('button', { name: 'Parâmetros' }).click();
  await expect(page.getByRole('table', { name: 'Parâmetros de consulta' })).toBeVisible();
});

test('shows welcome and moves to create with resolved destination', async ({ page }) => {
  await expectWelcomeScreen(page);
  await startWorkspaceCreation(page);
  await expect(page.getByTestId('destination')).toContainText(`${workspacePath}/My workspace`);
});

test('validates mismatched passwords and creates successfully', async ({ page }) => {
  await startWorkspaceCreation(page);
  await validateWorkspacePasswordConfirmation(page, {
    password: 'Master password',
    confirmation: 'Confirm password',
    submit: 'Create workspace',
    mismatch: 'Passwords do not match.',
  });
  await expect(page.getByRole('button', { name: 'My workspace ▾' })).toBeVisible();
});

test('opens an existing workspace, reports a bad password, and allows switching', async ({ page }) => {
  await clickButton(page, 'Choose workspace');
  await expect(page.getByRole('heading', { name: 'Unlock your workspace' })).toBeVisible();
  await unlockWithPassword(page, 'wrong');
  await expect(page.getByRole('alert')).toHaveText('Incorrect password or invalid workspace.');
  await unlockWithPassword(page, 'safe pass');
  await expect(page.getByRole('button', { name: 'Personal ▾' })).toBeVisible();
  await page.locator('.client-sidebar').getByRole('button', { name: 'Personal ▾' }).click();
  await expectWelcomeScreen(page);
});

test('folder dialog cancellation leaves the screen unchanged', async ({ page }) => {
  await page.evaluate(() => {
    if (window.__TOMORROW_API__) window.__TOMORROW_API__.SelectFolder = async () => '';
  });
  await clickButton(page, 'Choose workspace');
  await expectWelcomeScreen(page);
});

test('creates a collection and request, saves a draft, and sends it on demand', async ({ page }) => {
  await prepareRequest(page, 'https://api.example.test/users');
  await clickButton(page, 'Save');
  await expect(page.getByRole('button', { name: /GET.*New request/ })).toBeVisible();
  await clickButton(page, 'Send →');
  await expect(page.getByText('200 OK')).toBeVisible();
  await expect(page.getByText('{"ok":true}')).toBeVisible();
});

test('edits request authentication and query parameters', async ({ page }) => {
  await createRequest(page);
  await page.getByRole('button', { name: 'Params' }).click();
  await expect(page.getByRole('table', { name: 'Query parameters' })).toBeVisible();
  await clickButton(page, 'Add parameter');
  await page.getByLabel('Parameter key 1').fill('page');
  await page.getByLabel('Parameter value 1').fill('2');
  await page.getByRole('button', { name: 'Auth' }).click();
  await chooseOption(page, 'Authentication type', 'Bearer token');
  await page.getByLabel('Bearer token').fill('local-secret');
  await expect(page.getByRole('table', { name: 'Authentication credentials' })).toBeVisible();
  await clickButton(page, 'Add credential');
  await page.getByLabel('Credential key 1').fill('X-Credential');
  await page.getByLabel('Credential value 1').fill('local-value');
  await clickButton(page, 'Save');
  await expect(page.getByText('Saved')).toBeVisible();
  const savedRequest = await firstSavedRequest(page);
  expect(savedRequest?.query).toEqual({ page: '2' });
  expect(savedRequest?.authCredentials?.map(({ key, value }) => [key, value])).toEqual([['X-Credential', 'local-value']]);
});

test('edits and saves request headers in a key-value table', async ({ page }) => {
  await createRequest(page);
  await openRequestTab(page, 'Headers');
  await expect(page.getByRole('table', { name: 'Request headers' })).toBeVisible();
  await clickButton(page, 'Add header');
  await page.getByLabel('Header key 1').fill('X-Local');
  await page.getByLabel('Header value 1').fill('offline');
  await clickButton(page, 'Add header');
  await page.getByLabel('Header key 2').fill('X-Debug');
  await page.getByLabel('Header value 2').fill('disabled');
  await page.getByLabel('Enable Header 2').uncheck();
  await clickButton(page, 'Save');
  const savedRequest = await firstSavedRequest(page);
  expect(savedRequest?.headers).toEqual({ 'X-Local': 'offline' });
  expect(savedRequest?.headerRows?.map((row) => row.enabled)).toEqual([true, false]);
});

test('shows request history after a successful send', async ({ page }) => {
  await createAndSendRequest(page, 'https://api.example.test/users');
  await openHistory(page);
  await expect(page.getByText('New request · 200')).toBeVisible();
});

test('removes one history entry and keeps the remaining entries', async ({ page }) => {
  await createRequest(page);
  await page.getByLabel('Request name').fill('First request');
  await sendRequest(page, 'https://api.example.test/first');
  await page.getByLabel('Request name').fill('Second request');
  await sendRequest(page, 'https://api.example.test/second');
  await openHistory(page);
  await expect(page.locator('.history-entry')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove Second request from history' }).click();
  await expect(page.getByRole('dialog', { name: 'Remove history item?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.history-entry')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove Second request from history' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.history-entry')).toHaveCount(1);
  await expect(page.locator('.history-entry')).toContainText('First request');
});

test('confirms clearing history and lets the user cancel', async ({ page }) => {
  await createAndSendRequest(page, 'https://api.example.test/users');
  await openHistory(page);
  await clickButton(page, 'Clear history');
  await expect(page.getByRole('dialog', { name: 'Clear request history?' })).toBeVisible();
  await clickButton(page, 'Cancel');
  await expect(page.getByText('New request · 200')).toBeVisible();
  await clickButton(page, 'Clear history');
  await page.getByRole('dialog').getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByText('No requests yet.')).toBeVisible();
});

test('runs a collection sequentially when asked', async ({ page }) => {
  await prepareRequest(page, 'https://api.example.test/first');
  await openRequestTab(page, 'Post-response');
  await page.locator('#post-response-script').fill('environment.apiBase = "https://api.example.test";');
  await clickButton(page, 'Save');
  await chooseTreeAction(page, 'New collection', 'Add request');
  await fillRequestURL(page, '{{apiBase}}/next');
  await clickButton(page, 'Save');
  await page.evaluate(() => {
    const api = window.__TOMORROW_API__;
    if (!api) return;
    api.SendRequest = async (requestJSON) => {
      const request = JSON.parse(requestJSON) as { url: string; postResponseScript?: string };
      const urls = JSON.parse(window.localStorage.getItem('collection-run-urls') ?? '[]') as string[];
      urls.push(request.url);
      window.localStorage.setItem('collection-run-urls', JSON.stringify(urls));
      return { statusCode: 200, status: '200 OK', headers: {}, body: '{}', durationMs: 1, ...(request.postResponseScript ? { environment: { apiBase: 'https://api.example.test' } } : {}) };
    };
  });
  await chooseTreeAction(page, 'New collection', 'Run collection');
  await expect(page.getByText('New request · 200 OK')).toBeVisible();
  const requestURLs = await page.evaluate(() => JSON.parse(window.localStorage.getItem('collection-run-urls') ?? '[]') as string[]);
  expect(requestURLs).toEqual(['https://api.example.test/first', 'https://api.example.test/next']);
  await clickButton(page, 'Back to collections');
  await expect(page.getByLabel('Request URL')).toHaveValue('{{apiBase}}/next');
  await expect(page.getByRole('button', { name: 'Send →' })).toBeVisible();
});

test('generates code with query parameters, headers, bearer token, and attached files', async ({ page }) => {
  await prepareRequest(page, 'https://api.example.test/users');
  await chooseOption(page, 'HTTP method', 'POST');
  await openRequestTab(page, 'Params');
  await clickButton(page, 'Add parameter');
  await page.getByLabel('Parameter key 1').fill('page');
  await page.getByLabel('Parameter value 1').fill('2');
  await openRequestTab(page, 'Headers');
  await clickButton(page, 'Add header');
  await page.getByLabel('Header key 1').fill('X-Client');
  await page.getByLabel('Header value 1').fill('tomorrow');
  await openRequestTab(page, 'Auth');
  await chooseOption(page, 'Authentication type', 'Bearer token');
  await page.getByLabel('Bearer token').fill('secret-token');
  await openBodyTab(page);
  await chooseOption(page, 'Body type', 'Multipart');
  await clickButton(page, 'Add file field');
  await page.getByLabel('File field name 1').fill('avatar');
  await page.getByRole('button', { name: 'Choose files for field 1' }).click();
  await clickButton(page, 'Save');
  await chooseTreeAction(page, 'New request', 'Generate code');
  await expect(page.getByRole('dialog', { name: 'Generated code' })).toBeVisible();
  const dialogBounds = await page.getByRole('dialog', { name: 'Generated code' }).boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((dialogBounds!.x + dialogBounds!.width / 2) - viewport!.width / 2)).toBeLessThan(2);
  expect(Math.abs((dialogBounds!.y + dialogBounds!.height / 2) - viewport!.height / 2)).toBeLessThan(2);
  await expect(page.getByLabel('Request URL')).toBeVisible();
  const snippet = page.getByRole('dialog', { name: 'Generated code' }).locator('.response-content');
  for (const expected of ['--request POST', 'page=2', 'X-Client: tomorrow', 'Authorization: Bearer secret-token', `avatar=@${avatarFixture}`, `avatar=@${avatarSmallFixture}`]) await expect(snippet).toContainText(expected);
  await expectCodeLanguage(page, 'Python', ['files =', 'secret-token', avatarFixture]);
  await expectCodeLanguage(page, 'PHP', ['new CURLFile', 'Authorization: Bearer secret-token', avatarFixture]);
  await expectCodeLanguage(page, 'Node.js', ['new Blob', 'secret-token', avatarFixture]);
  await expectCodeLanguage(page, 'Go', ['CreateFormFile', 'secret-token', avatarFixture]);
  await expectCodeLanguage(page, 'Java', ['writeFilePart', 'secret-token', avatarFixture]);
  await expectCodeLanguage(page, 'wget', ['does not support multipart/form-data', 'Authorization: Bearer secret-token']);
});

test('shows the complete outgoing request line and useful timeline details', async ({ page }) => {
  await createRequest(page);
  await chooseOption(page, 'HTTP method', 'POST');
  await openRequestTab(page, 'Headers');
  await clickButton(page, 'Add header');
  await page.getByLabel('Header key 1').fill('X-Client');
  await page.getByLabel('Header value 1').fill('tomorrow');
  await sendRequest(page, 'https://api.example.test/users?active=true');
  await page.locator('.response-tabs').getByRole('button', { name: 'Request headers' }).click();
  await expect(page.locator('.response-content')).toContainText('POST /users?active=true HTTP/1.1');
  await expect(page.locator('.response-content')).toContainText('"X-Client": "tomorrow"');
  await page.locator('.response-tabs').getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.locator('.response-content')).toContainText('https://api.example.test/users?active=true');
  await expect(page.locator('.response-content')).toContainText('POST');
  await expect(page.locator('.response-content')).toContainText('200 OK');
  await expect(page.locator('.response-content')).toContainText('3 ms');
});

test('formats JSON response and request body on demand', async ({ page }) => {
  await createRequest(page);
  await openRequestTab(page, 'Pre-request');
  await expect(page.locator('#pre-request-script')).toHaveAttribute('placeholder', /(?=.*request\.headers)(?=.*environment\.userId)/s);
  await expect(page.getByText(/Pre-request runs before sending/)).toBeVisible();
  await openRequestTab(page, 'Post-response');
  await expect(page.locator('#post-response-script')).toHaveAttribute('placeholder', /response\.body/);
  await expect(page.getByText(/Save values for later requests/)).toBeVisible();
  await openRequestTab(page, 'Tests');
  await expect(page.locator('#test-script')).toHaveAttribute('placeholder', /response\.body/);
  await expect(page.getByText(/Tests run after post-response/)).toBeVisible();
  await openBodyTab(page);
  await page.getByLabel('Request body').fill('{"user":"Ada","active":true}');
  await clickButton(page, 'Format JSON');
  await expect(page.getByLabel('Request body')).toHaveValue('{\n  "user": "Ada",\n  "active": true\n}');
  await sendRequest(page, 'https://api.example.test/users');
  await clickButton(page, 'Format JSON response');
  await expect(page.locator('.response-content')).toContainText('{\n  "ok": true\n}');
});

test('shows accessible progress and disables Send while the request is processing', async ({ page }) => {
  await createRequest(page);
  await fillRequestURL(page, 'https://api.example.test/slow');
  await page.evaluate(() => {
    if (window.__TOMORROW_API__) window.__TOMORROW_API__.SendRequest = () => new Promise(() => {});
  });
  const send = page.getByRole('button', { name: 'Send →' });
  await send.click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Sending request…');
});

test('selects a file for a binary request body', async ({ page }) => {
  await createRequest(page);
  const bodyType = page.getByRole('combobox', { name: 'Body type' });
  await bodyType.click();
  await expect(page.locator('.select-menu')).toHaveCSS('background-color', 'rgb(17, 28, 43)');
  await page.getByRole('option', { name: 'Binary file' }).click();
  await clickButton(page, 'Choose file');
  await expect(page.getByText(payloadFixture)).toBeVisible();
});

test('keeps the body type menu above the response panel when Multipart is selected', async ({ page }) => {
  await createRequest(page);
  await openBodyTab(page);
  await chooseOption(page, 'Body type', 'Multipart');
  await page.getByRole('combobox', { name: 'Body type' }).click();
  await expect(page.locator('.select-menu').evaluate((menu) => menu.parentElement === document.body)).resolves.toBe(true);
  const lastOption = page.getByRole('option', { name: 'Binary file' });
  await expect(lastOption).toBeVisible();
  await lastOption.click();
  await expect(page.getByRole('combobox', { name: 'Body type' })).toContainText('Binary file');
});

test('edits Multipart file fields in a table', async ({ page }) => {
  await createRequest(page);
  await openBodyTab(page);
  await chooseOption(page, 'Body type', 'Multipart');
  await expect(page.getByLabel('Request body')).toHaveAttribute('placeholder', 'JSON text fields, e.g. {"name":"Ada"}');
  const table = page.getByRole('table', { name: 'Multipart files' });
  await expect(table).toBeVisible();
  await clickButton(page, 'Add file field');
  await expect(table.getByRole('textbox', { name: 'File field name 1' })).toHaveAttribute('placeholder', 'Field name');
  await table.getByRole('textbox', { name: 'File field name 1' }).fill('avatar');
  await table.getByRole('button', { name: 'Choose files for field 1' }).click();
  const chooseFiles = table.getByRole('button', { name: 'Choose files for field 1' });
  await expect(table.getByText('avatar.png')).toBeVisible();
  await expect(table.getByText('avatar-small.png')).toBeVisible();
  await table.getByRole('button', { name: 'Remove file avatar.png' }).click();
  await expect(table.getByText('avatar.png')).toHaveCount(0);
  await expect(table.getByText('avatar-small.png')).toBeVisible();
  await expect(chooseFiles).toBeVisible();
});

test('reorders collections in the navigation tree', async ({ page }) => {
  const nativeDialogs = dismissNativeDialogs(page);
  await clickButton(page, 'Choose workspace');
  await unlockWithPassword(page, 'safe pass');
  await clickButton(page, 'Add collection');
  await clickButton(page, 'Add collection');
  await page.getByRole('button', { name: 'Actions for New collection' }).nth(1).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await expect(page.getByRole('dialog', { name: 'Rename item' })).toBeVisible();
  await page.getByLabel('Item name').fill('Later');
  await clickButton(page, 'Rename');
  await chooseTreeAction(page, 'Later', 'Move up');
  const names = await collectionTreeNames(page);
  expect(names.slice(0, 2)).toEqual(['▾Later', '▾Newcollection']);
  expect(nativeDialogs).toEqual([]);
});

test('keeps collection actions inside a single labeled menu', async ({ page }) => {
  await enterExistingWorkspace(page);
  await clickButton(page, 'Add collection');
  const row = page.locator('.tree-row').filter({ hasText: 'New collection' });
  await expect(row.locator('button')).toHaveCount(2);
  await row.getByRole('button', { name: 'Actions for New collection' }).click();
  const menu = page.getByRole('menu', { name: 'New collection actions' });
  await expect(menu).toHaveCount(1);
  await expect(menu.getByRole('menuitem')).toHaveCount(9);
  expect(await menu.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  const menuFitsWindow = await menu.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight;
  });
  expect(menuFitsWindow).toBe(true);
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Add request' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
});

test('double-clicking a collection, folder, or request opens rename', async ({ page }) => {
  await enterExistingWorkspace(page);
  await clickButton(page, 'Add collection');
  const renameRow = async (name: string, nextName: string) => {
    await page.locator('.tree-item').filter({ hasText: name }).dblclick();
    const dialog = page.getByRole('dialog', { name: 'Rename item' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Item name').fill(nextName);
    await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.locator('.tree-item').filter({ hasText: nextName })).toBeVisible();
  };

  await renameRow('New collection', 'Renamed collection');
  await chooseTreeAction(page, 'Renamed collection', 'Add folder');
  await renameRow('New folder', 'Renamed folder');
  await chooseTreeAction(page, 'Renamed folder', 'Add request');
  await renameRow('New request', 'Renamed request');
});

test('renders selects with the dark theme palette', async ({ page }) => {
  await createRequest(page);
  const select = page.getByRole('combobox', { name: 'HTTP method' });
  await expect(select).toHaveCSS('height', '36px');
  await expect(select).toHaveCSS('background-color', 'rgb(17, 28, 43)');
  await select.click();
  await expect(page.locator('.select-menu')).toHaveCSS('background-color', 'rgb(17, 28, 43)');
});

test('uses an environment selector in the request toolbar', async ({ page }) => {
  await createRequest(page);
  await expect(page.locator('.client-toolbar').getByRole('button', { name: 'Development' })).toBeVisible();
  await expect(page.locator('.client-toolbar').getByRole('button', { name: 'Switch workspace' })).toHaveCount(0);
  await createEnvironmentVariable(page, 'Staging', 'baseUrl', 'https://staging.example.test');
  await expect(page.locator('.client-toolbar').getByRole('button', { name: 'Staging' })).toBeVisible();
  await selectURLVariableAtCursor(page);
  await selectBodyVariableAtCursor(page);
  await openRequestTab(page, 'Post-response');
  await page.locator('#post-response-script').fill('const data = JSON.parse(response.body); environment.accessToken = String(data.access_token);');
  await page.evaluate(() => {
    const api = window.__TOMORROW_API__;
    if (!api) return;
    const original = api.SendRequest;
    api.SendRequest = async (requestJSON) => {
      window.localStorage.setItem('sent-environment-request', requestJSON);
      const result = await original(requestJSON);
      return { ...result, body: '{"access_token":"api-token"}', environment: { baseUrl: 'https://staging.example.test', accessToken: 'api-token' } };
    };
  });
  await clickButton(page, 'Send →');
  const sentRequest = await page.evaluate(() => window.localStorage.getItem('sent-environment-request'));
  expect(JSON.parse(sentRequest ?? '{}').url).toBe('https://staging.example.test/users');
  expect(JSON.parse(sentRequest ?? '{}').postResponseScript).toContain('environment.accessToken');
  const persistedToken = await page.evaluate(async () => (await window.__TOMORROW_API__?.Environments())?.find((item) => item.name === 'Staging')?.values.accessToken);
  expect(persistedToken).toBe('api-token');
  await page.locator('.client-toolbar').getByRole('button', { name: 'Staging' }).click();
  await page.getByRole('menuitemradio', { name: 'Development' }).click();
  await expect(page.locator('.client-toolbar').getByRole('button', { name: 'Development' })).toBeVisible();
  await expect(page.locator('.client-sidebar').getByRole('button', { name: /Personal/ })).toBeVisible();
});

test('imports a Postman environment and exports it from the workspace', async ({ page }) => {
  await createRequest(page);
  await page.getByRole('button', { name: 'Import and export' }).click();
  await setPostmanEnvironmentFile(page, 'qa.postman_environment.json', 'baseUrl', 'https://qa.example.test');
  await page.getByRole('dialog', { name: 'Review import' }).getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('combobox', { name: 'Items to export' }).click();
  await expect(page.getByRole('option', { name: 'QA' })).toBeVisible();
  await page.getByRole('option', { name: 'QA' }).click();
  const exported = await exportPostmanJSON(page, 'QA.postman_environment.json') as { name: string; values: Array<{ key: string; value: string; enabled: boolean; type: string }> };
  expect(exported.name).toBe('QA');
  expect(exported.values).toContainEqual({ key: 'baseUrl', value: 'https://qa.example.test', enabled: true, type: 'default' });
  await page.getByRole('combobox', { name: 'Items to export' }).click();
  await page.getByRole('option', { name: 'Collections' }).click();
  const collection = await exportPostmanJSON(page, 'tomorrow.postman_collection.json') as { info: { schema: string }; item: Array<{ item: Array<{ name: string }> }> };
  expect(collection.info.schema).toContain('/collection/v2.1.0/');
  expect(collection.item[0].item[0].name).toBe('New request');
});

test('retries a failed connection only after the user asks', async ({ page }) => {
  await prepareRequest(page, 'https://api.example.test/users');
  await page.evaluate(() => {
    if (!window.__TOMORROW_API__) return;
    let attempts = 0;
    window.__TOMORROW_API__.SendRequest = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('connection refused');
      return { statusCode: 200, status: '200 OK', headers: {}, body: '{"ok":true}', durationMs: 3 };
    };
  });
  await clickButton(page, 'Send →');
  await expect(page.getByRole('alert')).toBeVisible();
  await clickButton(page, 'Retry');
  await expect(page.getByText('200 OK')).toBeVisible();
});

test('duplicates an item and confirms its deletion', async ({ page }) => {
  const nativeDialogs = dismissNativeDialogs(page);
  await clickButton(page, 'Choose workspace');
  await unlockWithPassword(page, 'safe pass');
  await clickButton(page, 'Add collection');
  await chooseTreeAction(page, 'New collection', 'Duplicate');
  await expect(page.locator('.tree-item').filter({ hasText: 'New collection copy' })).toBeVisible();
  await chooseTreeAction(page, 'New collection copy', 'Delete');
  await expect(page.getByRole('dialog', { name: 'Delete item' })).toBeVisible();
  await clickButton(page, 'Delete item');
  await expect(page.locator('.tree-item').filter({ hasText: 'New collection copy' })).toHaveCount(0);
  expect(nativeDialogs).toEqual([]);
});

test('moves a request into another collection', async ({ page }) => {
  await createRequest(page);
  await clickButton(page, 'Add collection');
  await chooseTreeAction(page, 'New request', 'Move to…');
  await chooseOption(page, 'Move destination', 'New collection', 1);
  await clickButton(page, 'Move request');
  const names = await collectionTreeNames(page);
  expect(names).toEqual(['▾Newcollection', '▾Newcollection', 'GETNewrequest']);
});

test('asks to save a draft before navigating to history', async ({ page }) => {
  const nativeDialogs = dismissNativeDialogs(page);
  await prepareRequest(page, 'https://api.example.test/saved');
  await openHistory(page);
  await expect(page.getByRole('dialog', { name: 'Unsaved request' })).toBeVisible();
  await clickButton(page, 'Save and continue');
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  const savedRequest = await firstSavedRequest(page);
  expect(savedRequest?.url).toBe('https://api.example.test/saved');
  expect(nativeDialogs).toEqual([]);
});

test('keeps the request open when leaving an unsaved request is cancelled', async ({ page }) => {
  await prepareRequest(page, 'https://api.example.test/unsaved');
  await openHistory(page);
  await expect(page.getByRole('dialog', { name: 'Unsaved request' })).toBeVisible();
  await clickButton(page, 'Stay here');
  await expect(page.getByLabel('Request URL')).toHaveValue('https://api.example.test/unsaved');
  await expect(page.getByRole('heading', { name: 'History' })).toHaveCount(0);
});

test('shows response headers, cookies, and timing details', async ({ page }) => {
  await createRequest(page);
  await sendRequest(page, 'https://api.example.test/users');
  await page.locator('.response-tabs').getByRole('button', { name: 'Request headers' }).click();
  await expect(page.getByText(/User-Agent.*Tomorrow\/0.1.0/)).toBeVisible();
  await page.locator('.response-tabs').getByRole('button', { name: 'Response headers', exact: true }).click();
  await expect(page.getByText(/Content-Type.*application\/json/)).toBeVisible();
  await page.locator('.response-tabs').getByRole('button', { name: 'Cookies', exact: true }).click();
  await expect(page.getByText('session=local')).toBeVisible();
  await page.locator('.response-tabs').getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.locator('.response-content')).toContainText('3 ms');
});

test('renders HTML resources and scripts in the isolated response preview', async ({ page }) => {
  await prepareRequest(page, 'https://api.example.test/preview/page.html');
  await page.route('https://api.example.test/preview/preview.css', (route) => route.fulfill({ contentType: 'text/css', body: 'h1 { color: rgb(255, 0, 0); }' }));
  await page.route('https://api.example.test/preview/preview.png', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/zZ8AAAAASUVORK5CYII=', 'base64') }));
  await page.evaluate(() => {
    if (window.__TOMORROW_API__) window.__TOMORROW_API__.SendRequest = async () => ({ statusCode: 200, status: '200 OK', url: 'https://api.example.test/preview/page.html', headers: { 'Content-Type': 'text/html' }, body: '<!doctype html><html><head><link rel="stylesheet" href="preview.css"></head><body><h1>Local preview</h1><img src="preview.png"><script>document.querySelector("h1").textContent = "Script ran"</script></body></html>', durationMs: 4 });
  });
  await clickButton(page, 'Send →');
  await page.locator('.response-tabs').getByRole('button', { name: 'Preview', exact: true }).click();
  const frame = page.frameLocator('iframe[title="HTML response preview"]');
  await expect(page.getByTitle('HTML response preview')).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(frame.locator('base')).toHaveAttribute('href', 'https://api.example.test/preview/page.html');
  await expect(frame.locator('h1')).toHaveText('Script ran');
  await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(frame.locator('img')).toHaveJSProperty('naturalWidth', 1);
});

test('opens environment management and reviews Postman imports before saving', async ({ page }) => {
  await openEnvironments(page);
  await expect(page.getByText('YOUR ENVIRONMENTS')).toBeVisible();
  await page.getByRole('button', { name: 'Import and export' }).click();
  await setPostmanEnvironmentFile(page, 'qa.json', 'host', 'localhost');
  await expect(page.getByRole('dialog', { name: 'Review import' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Environments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'QA', exact: true })).toHaveCount(0);
});

test('preserves exportability of environment variables after saving', async ({ page }) => {
  await openEnvironments(page);
  await page.getByRole('button', { name: 'Add variable' }).click();
  await page.getByLabel('Variable key 1').fill('token');
  await page.getByLabel('Variable value 1').fill('secret-value');
  await page.getByLabel('Export variable 1').uncheck();
  await expect(page.getByLabel('Variable value 1')).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await returnToEnvironments(page);
  await expect(page.getByLabel('Export variable 1')).not.toBeChecked();
});

test('new environment variables are exportable by default', async ({ page }) => {
  await openEnvironments(page);
  await page.getByRole('button', { name: 'Add variable' }).click();
  await expect(page.getByLabel('Export variable 1')).toBeChecked();
});

test('confirms environment deletion and keeps it when cancelled', async ({ page }) => {
  await openEnvironments(page);
  await page.getByRole('button', { name: 'New environment', exact: false }).first().click();
  await page.getByLabel('Environment name').fill('Staging');
  await page.getByRole('button', { name: 'Create environment' }).click();
  await page.getByRole('button', { name: 'Staging', exact: true }).click();
  await page.getByRole('button', { name: 'Delete environment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete environment' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Staging', exact: true })).toBeVisible();
});

test('keeps collection menu actions in separate rows', async ({ page }) => {
  await enterExistingWorkspace(page);
  await page.getByRole('button', { name: 'Add collection' }).click();
  await openTreeActions(page, 'New collection');
  const menu = page.getByRole('menu', { name: 'New collection actions' });
  const up = await menu.getByRole('menuitem', { name: 'Move up' }).boundingBox();
  const down = await menu.getByRole('menuitem', { name: 'Move down' }).boundingBox();
  expect(up && down && down.y >= up.y + up.height).toBeTruthy();
});

test('drags a request into a folder', async ({ page }) => {
  await createRequest(page);
  await chooseTreeAction(page, 'New collection', 'Add folder');
  await page.getByRole('button', { name: 'GET New request' }).dragTo(page.getByRole('button', { name: '▾ New folder' }));
  const requestRow = page.locator('.tree-row').filter({ hasText: 'New request' });
  await expect(requestRow).toHaveCSS('padding-left', '35px');
  const request = page.getByRole('button', { name: 'GET New request' });
  await expect(requestRow).toHaveClass(/active/);
  await expect(request).toBeFocused();
});

test('collapses and expands collections and folders', async ({ page }) => {
  await createRequest(page);
  const collection = page.getByRole('button', { name: /New collection/ }).filter({ hasNot: page.locator('[aria-haspopup]') }).first();
  await collection.click();
  await expect(collection).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'GET New request' })).toHaveCount(0);
  await collection.click();
  await expect(collection).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'GET New request' })).toBeVisible();
});

test('minimizes and restores the response panel', async ({ page }) => {
  await createRequest(page);
  await page.getByRole('button', { name: 'Minimize response' }).click();
  await expect(page.getByRole('button', { name: 'Restore response' })).toBeVisible();
  await expect(page.locator('.response-panel').getByRole('button', { name: 'Body', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore response' }).click();
  await expect(page.getByRole('slider', { name: 'Resize response' })).toBeVisible();
});

test('reorders requests by dragging below another request', async ({ page }) => {
  await createRequest(page);
  await chooseTreeAction(page, 'New request', 'Duplicate');
  const source = page.getByRole('button', { name: 'GET New request', exact: true });
  const destination = page.getByRole('button', { name: 'GET New request copy', exact: true });
  const bounds = await destination.boundingBox();
  expect(bounds).not.toBeNull();
  await source.dragTo(destination, { targetPosition: { x: 40, y: bounds!.height - 2 } });
  await expect(page.locator('.tree-row .tree-name')).toHaveText(['New collection', 'New request copy', 'New request']);
});

test('reorders folders by dragging above another folder', async ({ page }) => {
  await createRequest(page);
  await chooseTreeAction(page, 'New collection', 'Add folder');
  await chooseTreeAction(page, 'New folder', 'Duplicate');
  const source = page.getByRole('button', { name: '▾ New folder copy', exact: true });
  const destination = page.getByRole('button', { name: '▾ New folder', exact: true });
  await source.dragTo(destination, { targetPosition: { x: 40, y: 3 } });
  await expect(page.locator('.tree-row .tree-name')).toHaveText(['New collection', 'New request', 'New folder copy', 'New folder']);
});

test('selects a newly created collection in the tree', async ({ page }) => {
  await createRequest(page);
  await clickButton(page, 'Add collection');
  const collections = page.locator('.tree-row').filter({ has: page.getByRole('button', { name: /New collection/ }) });
  await expect(collections.nth(1)).toHaveClass(/\bactive\b/, { timeout: 2000 });
  await expect(collections.nth(1).locator('.tree-item')).toBeFocused({ timeout: 2000 });
  await expect(page.locator('.tree-row').filter({ hasText: 'New request' })).not.toHaveClass(/\bactive\b/);
  await expect(page.getByLabel('Request URL')).toBeVisible();
});

test('selects a clicked collection while preserving the open request', async ({ page }) => {
  await createRequest(page);
  const collection = page.getByRole('button', { name: '▾ New collection', exact: true });
  await collection.click();
  await expect(page.locator('.tree-row').filter({ hasText: 'New collection' })).toHaveClass(/\bactive\b/, { timeout: 2000 });
  await expect(page.getByLabel('Request URL')).toBeVisible();
});

test('expands the collection and focuses a newly added request', async ({ page }) => {
  await enterExistingWorkspace(page);
  await clickButton(page, 'Add collection');
  const collection = page.getByRole('button', { name: '▾ New collection', exact: true });
  await collection.click();
  await chooseTreeAction(page, 'New collection', 'Add request');
  await expect(collection).toHaveAttribute('aria-expanded', 'true');
  const requests = page.getByRole('button', { name: 'GET New request', exact: true });
  await expect(requests).toHaveCount(1);
  await expect(page.locator('.tree-row').filter({ has: requests })).toHaveClass(/active/);
  await expect(requests).toBeFocused();
});

test('styles authentication controls with the dark palette', async ({ page }) => {
  await createRequest(page);
  await page.getByRole('button', { name: 'Auth' }).click();
  const selector = page.getByRole('combobox', { name: 'Authentication type' });
  await expect(selector).toHaveCSS('height', '36px');
  await chooseOption(page, 'Authentication type', 'Bearer token');
  await expect(page.getByRole('button', { name: 'Add credential' })).toHaveCSS('color', 'rgb(82, 214, 187)');
});

test('uses a consistent height for request selectors', async ({ page }) => {
  await createRequest(page);
  const method = page.getByRole('combobox', { name: 'HTTP method' });
  const methodHeight = await method.evaluate((element) => element.getBoundingClientRect().height);
  const urlHeight = await page.getByLabel('Request URL').evaluate((element) => element.getBoundingClientRect().height);
  expect(urlHeight).toBe(methodHeight);
  await openBodyTab(page);
  const body = page.getByRole('combobox', { name: 'Body type' });
  const bodyHeight = await body.evaluate((element) => element.getBoundingClientRect().height);
  await openRequestTab(page, 'Auth');
  const authentication = page.getByRole('combobox', { name: 'Authentication type' });
  const authenticationHeight = await authentication.evaluate((element) => element.getBoundingClientRect().height);
  expect(new Set([methodHeight, bodyHeight, authenticationHeight]).size).toBe(1);
});


test('select supports keyboard navigation and selection', async ({ page }) => {
  await createRequest(page);
  const method = page.getByRole('combobox', { name: 'HTTP method' });
  await method.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'HTTP method' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(method).toContainText('POST');
});

test('returns to collections from history navigation', async ({ page }) => {
  await createRequest(page);
  await openHistory(page);
  await expect(page.locator('.history-view')).toBeVisible();
  const historyBounds = await page.locator('.history-view').boundingBox();
  const mainBounds = await page.locator('.client-main').boundingBox();
  expect(historyBounds).not.toBeNull();
  expect(mainBounds).not.toBeNull();
  expect(historyBounds!.height).toBeGreaterThan(mainBounds!.height * 0.8);
  await clickButton(page, 'Collections');
  await expect(page.locator('.history-view')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Collections' })).toBeVisible();
});

test('closes environment and collection menus when clicking outside', async ({ page }) => {
  await createRequest(page);
  await page.locator('.client-toolbar').getByRole('button', { name: 'Development' }).click();
  await expect(page.getByRole('menu', { name: 'Environments' })).toBeVisible();
  await expectMenuToCloseOnRequestURLClick(page, 'Environments');
  await openTreeActions(page, 'New collection');
  await expect(page.getByRole('menu', { name: 'New collection actions' })).toBeVisible();
  await expectMenuToCloseOnRequestURLClick(page, 'New collection actions');
});

test('keeps dropdown option labels fully visible near the viewport edge', async ({ page }) => {
  await createRequest(page);
  await openBodyTab(page);
  const select = page.getByRole('combobox', { name: 'Body type' });
  await select.evaluate((element) => { (element.parentElement as HTMLElement).style.cssText = 'width: 72px; min-width: 0;'; });
  await select.click();
  const menu = page.locator('.select-menu');
  const option = page.getByRole('option', { name: 'Form URL-encoded' });
  const layout = await page.evaluate(() => {
    const menuElement = document.querySelector<HTMLElement>('.select-menu')!;
    const optionElement = menuElement.querySelector<HTMLElement>('[role="option"]:nth-child(3)')!;
    return { right: menuElement.getBoundingClientRect().right, viewport: window.innerWidth, optionWidth: optionElement.clientWidth, contentWidth: optionElement.scrollWidth };
  });
  expect(layout.contentWidth).toBeLessThanOrEqual(layout.optionWidth);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport);
  await expect(option).toBeVisible();
  await menu.press('Escape');
});
