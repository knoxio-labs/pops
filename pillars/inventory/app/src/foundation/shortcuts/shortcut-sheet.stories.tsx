import { ShortcutSheetBody } from './shortcut-sheet';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Inventory/Foundation/ShortcutSheet',
  component: ShortcutSheetBody,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ShortcutSheetBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShortcutSheet: Story = {
  render: () => (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <ShortcutSheetBody />
    </div>
  ),
};
