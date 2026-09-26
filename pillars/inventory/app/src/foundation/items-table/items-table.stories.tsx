import { act } from 'react';

import { useSelection } from '../selection/use-selection';
import { coreItem, coreWorld } from '../test-fixtures/core';
import { ItemsTable } from './items-table';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import type { SelectionState } from '../selection/use-selection';
import type { TableDensity } from './table-row';

const ROW_IDS = [
  'box-k13',
  'itm-tv',
  'itm-tape',
  'itm-drill',
  'itm-lamp',
  'itm-router',
  'itm-kettle',
  'itm-mugs',
  'itm-soundbar',
  'itm-toaster',
  'itm-plates',
  'itm-headphones',
] as const;

const ROWS = ROW_IDS.map((id) => coreItem(id));
const INITIAL_SELECTION: SelectionState = {
  selected: new Set(['box-k13']),
  anchorId: 'box-k13',
  focusedId: 'itm-tv',
};

const meta = {
  title: 'Inventory/Foundation/ItemsTable',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function TableFrame({ density = 'default' }: { density?: TableDensity }): ReactElement {
  const selection = useSelection(ROW_IDS, INITIAL_SELECTION);
  return (
    <div className="flex h-screen min-h-0 flex-col bg-muted/30 p-4">
      <ItemsTable
        rows={ROWS}
        total={40}
        world={coreWorld}
        selection={selection}
        density={density}
        pendingIds={new Set(['itm-tape'])}
        rejections={{ 'itm-drill': 'Office 04 is closed, so Cordless drill stayed on Workbench.' }}
        label="Inventory items"
      />
    </div>
  );
}

export const Table: Story = {
  render: () => <TableFrame />,
};

export const Compact: Story = {
  render: () => <TableFrame density="compact" />,
};

export const Resized: Story = {
  render: () => <TableFrame />,
  play: async ({ canvasElement }) => {
    const nameGrip = canvasElement.querySelector<HTMLElement>('[aria-label^="Resize Name"]');
    const whereGrip = canvasElement.querySelector<HTMLElement>('[aria-label^="Resize Where"]');
    if (nameGrip === null || whereGrip === null) {
      throw new Error('The table resize grips were not rendered');
    }
    const nameCell = nameGrip.parentElement;
    if (nameCell === null) throw new Error('The Name header cell was not rendered');
    const startX = nameGrip.getBoundingClientRect().left;
    const deltaX = 320 - nameCell.getBoundingClientRect().width;
    await act(async () => {
      nameGrip.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: startX,
          pointerId: 1,
        })
      );
      nameGrip.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: startX + deltaX,
          pointerId: 1,
        })
      );
      nameGrip.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: startX + deltaX,
          pointerId: 1,
        })
      );
      whereGrip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
  },
};
