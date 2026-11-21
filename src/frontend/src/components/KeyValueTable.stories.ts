import type { Meta, StoryObj } from '@storybook/svelte';
import KeyValueTable from './KeyValueTable.svelte';

const meta = {
  title: 'Requests/Key value table',
  component: KeyValueTable,
  parameters: { docs: { description: { component: 'Edits key-value rows, including exportable environment variables and optional environment variable value suggestions.' } } },
} satisfies Meta<typeof KeyValueTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RequestHeaders: Story = {
  args: {
    ariaLabel: 'Request headers',
    itemName: 'Header',
    addLabel: 'Add header',
    suggestions: ['{{baseUrl}}', '{{accessToken}}'],
    rows: [
      { id: 'accept', key: 'Accept', value: 'application/json', enabled: true },
      { id: 'authorization', key: 'Authorization', value: 'Bearer •••••••', enabled: false },
    ],
  },
};

export const EnvironmentVariables: Story = {
  args: {
    ariaLabel: 'Environment variables', itemName: 'Variable', addLabel: 'Add variable', showTypes: true,
    rows: [
      { id: 'url', key: 'baseUrl', value: 'http://localhost:8080', enabled: true },
      { id: 'token', key: 'accessToken', value: 'example', enabled: true, secret: true },
    ],
  },
};
