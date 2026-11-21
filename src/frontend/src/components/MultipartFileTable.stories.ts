import type { Meta, StoryObj } from '@storybook/svelte';
import MultipartFileTable from './MultipartFileTable.svelte';

const meta = {
  title: 'Requests/Multipart file table',
  component: MultipartFileTable,
  parameters: { docs: { description: { component: 'Edits named file fields included in a multipart request. The editor, file controls, borders, and text follow the selected application theme.' } } },
} satisfies Meta<typeof MultipartFileTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFiles: Story = {
  args: {
    rows: [
      { id: 'avatar', name: 'avatar', paths: ['/home/user/Documents/avatar.png', '/home/user/Documents/avatar-small.png'], enabled: true },
      { id: 'attachment', name: 'attachment', paths: [], enabled: true },
    ],
  },
};
