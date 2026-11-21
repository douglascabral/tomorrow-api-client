import type { Meta, StoryObj } from '@storybook/svelte';
import Select from './Select.svelte';

const meta = { title: 'Components/Select', component: Select } satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {
  id: 'story-select', label: 'Body type', value: 'JSON', className: 'body-type-select',
  options: [
    { value: 'JSON', label: 'JSON' }, { value: 'Text', label: 'Text' },
    { value: 'Form URL-encoded', label: 'Form URL-encoded' }, { value: 'Multipart', label: 'Multipart' },
    { value: 'Binary file', label: 'Binary file' },
  ],
} };

export const KeyboardNavigation: Story = { args: {
  ...Default.args, id: 'story-select-keyboard', label: 'HTTP method', value: 'GET',
  options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({ value: method, label: method })),
} };
