import { coreItem, coreWorld } from '../test-fixtures/core';
import { ItemList, ItemRow } from './item-row';

import type { Meta, StoryObj } from '@storybook/react-vite';

const ROW_IDS = ['itm-tv', 'itm-soundbar', 'itm-toaster', 'itm-lamp', 'itm-chair'] as const;

const meta = {
  title: 'Inventory/Foundation/Rows',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A quiet list of ordinary items using the shared row shape. */
export const Rows: Story = {
  render: () => (
    <ItemList label="Inventory items">
      {ROW_IDS.map((id) => (
        <ItemRow key={id} item={coreItem(id)} world={coreWorld} />
      ))}
    </ItemList>
  ),
};
