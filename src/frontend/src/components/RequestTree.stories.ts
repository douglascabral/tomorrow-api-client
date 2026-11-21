import type { Meta, StoryObj } from '@storybook/svelte';
import RequestTree from './RequestTree.svelte';

const meta = {
  title: 'Collections/Request tree',
  component: RequestTree,
  parameters: { docs: { description: { component: 'Expandable collection and folder tree with a vertical actions menu. Request actions include code generation for cURL, wget, PHP, Node.js, Python, Go, and Java. Drag handles and drop indicators support moving and reordering requests and folders.' } } },
} satisfies Meta<typeof RequestTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NestedRequests: Story = {
  args: {
    collections: [{
      id: 'store', name: 'Store API', kind: 'collection', children: [
        { id: 'users', name: 'Users', kind: 'folder', children: [
          { id: 'list', name: 'List users', kind: 'request', method: 'GET', url: 'https://api.example.test/users' },
          { id: 'create', name: 'Create user', kind: 'request', method: 'POST', url: 'https://api.example.test/users' },
        ] },
      ],
    }],
    selectedID: 'create',
  },
};

export const SelectedCollection: Story = { args: { ...NestedRequests.args, selectedID: 'store' } };
