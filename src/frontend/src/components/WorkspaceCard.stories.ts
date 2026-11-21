import type { Meta, StoryObj } from '@storybook/svelte';
import WorkspaceCard from './WorkspaceCard.svelte';

const meta = { title: 'Components/Workspace card', component: WorkspaceCard } satisfies Meta<typeof WorkspaceCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { name: 'Personal', path: '/home/user/Documents/Personal' } };
