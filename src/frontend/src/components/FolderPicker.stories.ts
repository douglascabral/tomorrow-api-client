import type { Meta, StoryObj } from '@storybook/svelte';
import FolderPicker from './FolderPicker.svelte';

const meta = { title: 'Components/Folder picker', component: FolderPicker, parameters: { docs: { description: { component: 'The folder path field and browse control follow the active application theme.' } } } } satisfies Meta<typeof FolderPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { id: 'workspace-folder', label: 'Workspace folder', placeholder: 'Choose a parent folder…' } };
export const Selected: Story = { args: { id: 'workspace-folder-selected', label: 'Workspace folder', value: '/home/user/Documents' } };
