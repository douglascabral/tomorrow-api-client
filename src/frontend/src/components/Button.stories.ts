import type { Meta, StoryObj } from '@storybook/svelte';
import Button from './Button.svelte';

const meta = { title: 'Components/Button', component: Button } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary', label: 'Create workspace' } };
export const Secondary: Story = { args: { variant: 'secondary', label: 'Choose workspace' } };
export const Back: Story = { args: { variant: 'back', label: '← Back' } };
export const Disabled: Story = { args: { variant: 'primary', label: 'Creating…', disabled: true } };
