import { SearchBar } from './search-bar.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Inventory/Search/SearchBar',
  component: SearchBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof SearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Inventory scope with both server counts and URL-owned filters visible. */
export const Inventory: Story = {
  args: {
    query: 'lamp',
    scope: 'inventory',
    counts: { inventory: 12, purchases: 4 },
    filters: { typeKey: null, within: null },
    typeOptions: [{ value: 'lighting', label: 'Lighting' }],
    placementOptions: [{ value: 'living-room', label: 'Living room' }],
    onQueryChange: () => undefined,
    onScopeChange: () => undefined,
    onFiltersChange: () => undefined,
  },
};

/** Purchases scope with inventory-only filters intentionally disabled. */
export const Purchases: Story = {
  args: {
    ...Inventory.args,
    scope: 'purchases',
  },
};
