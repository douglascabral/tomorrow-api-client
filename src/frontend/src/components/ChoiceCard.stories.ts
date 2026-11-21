import type { Meta, StoryObj } from '@storybook/svelte';
import ChoiceCard from './ChoiceCard.svelte';

const meta = { title: 'Components/Choice card', component: ChoiceCard } satisfies Meta<typeof ChoiceCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CreateWorkspace: Story = {
  args: { symbol: '+', title: 'Create a workspace', description: 'Start fresh with an encrypted local workspace.', actionLabel: 'Create workspace', actionVariant: 'primary' },
};

export const OpenWorkspace: Story = {
  args: { symbol: '↗', title: 'Open existing', description: 'Choose a workspace folder on this device.', actionLabel: 'Choose workspace', actionVariant: 'secondary' },
};
