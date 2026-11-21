import type { Meta, StoryObj } from '@storybook/svelte';
import TextField from './TextField.svelte';

const meta = { title: 'Components/Text field', component: TextField, parameters: { docs: { description: { component: 'The reusable labeled input follows the active application theme.' } } } } satisfies Meta<typeof TextField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceName: Story = { args: { id: 'workspace-name', label: 'Workspace name', value: 'My workspace', maxlength: 64 } };
export const Password: Story = { args: { id: 'password', label: 'Master password', type: 'password', value: 'secret', autocomplete: 'new-password', required: true } };
