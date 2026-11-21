import type { Meta, StoryObj } from '@storybook/svelte';
import App from './App.svelte';

const meta = {
  title: 'Screens/Workspace',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Workspace welcome, creation, unlock, collections, request editing, environments, transfer, and settings screens.',
      },
    },
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = {};
