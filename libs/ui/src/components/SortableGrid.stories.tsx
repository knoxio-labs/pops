import { GripVertical } from 'lucide-react';
import { useState } from 'react';

import { SortableGrid } from './SortableGrid';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SortableGrid> = {
  title: 'Layout/SortableGrid',
  component: SortableGrid,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ disabled = false }: { disabled?: boolean }) {
  const [items, setItems] = useState(['São Paulo', 'Curitiba', 'Porto Alegre']);
  return (
    <SortableGrid
      items={items}
      getKey={(item) => item}
      onReorder={setItems}
      disabled={disabled}
      columnsClassName="grid-cols-1"
      renderItem={(item) => (
        <article className="flex min-h-24 items-center gap-3 rounded-xl border bg-card p-5">
          <GripVertical className="size-5" aria-hidden />
          <span className="font-semibold">{item}</span>
        </article>
      )}
    />
  );
}

/** Native drag lifts the entire card; its empty slot previews the drop position. */
export const Route: Story = { render: () => <Example /> };
/** Disabled sorting leaves cards readable and cannot change their order. */
export const Disabled: Story = { render: () => <Example disabled /> };
