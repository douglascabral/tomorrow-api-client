import type { Meta, StoryObj } from '@storybook/svelte';
import Brand from './Brand.svelte';

const meta = { title: 'Components/Brand', component: Brand } satisfies Meta<typeof Brand>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
