import type { Meta, StoryObj } from '@storybook/svelte';
import ResponsePanel from './ResponsePanel.svelte';

const meta = {
  title: 'Requests/Resizable response panel',
  component: ResponsePanel,
  parameters: { docs: { description: { component: 'Displays formatted response headers and JSON, the outgoing request line with headers in formatted JSON, HTML preview, request timeline, cookies, and script results.' } } },
} satisfies Meta<typeof ResponsePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const response = {
  statusCode: 201,
  status: '201 Created',
  headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'session=local; HttpOnly' },
  body: '{ "data": { "id": 42, "name": "Ada" } }',
  durationMs: 218,
};

export const JSONResponse: Story = { args: { response, requestHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer ••••••••' }, requestLine: 'GET /users HTTP/1.1', requestURL: 'https://api.example.test/users' } };
export const RequestTimeline: Story = { args: { response, requestLine: 'GET /users HTTP/1.1', requestURL: 'https://api.example.test/users', responseTab: 'Timeline' } };
export const HTMLPreview: Story = { args: { response: { ...response, headers: { 'Content-Type': 'text/html' }, body: '<h1>Example</h1>' }, responseTab: 'Preview' } };
export const FailedRequest: Story = { args: { requestError: 'Connection failed.', onRetry: () => {} } };
