import type { Meta, StoryObj } from '@storybook/svelte';
import Message from './Message.svelte';

const meta = { title: 'Components/Message', component: Message } satisfies Meta<typeof Message>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Error: Story = { args: { message: 'Passwords do not match.', kind: 'error' } };
export const Info: Story = { args: { message: 'Destination: /home/user/Documents/My workspace', kind: 'info' } };
