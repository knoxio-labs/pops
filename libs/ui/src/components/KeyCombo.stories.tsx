import { KeyCombo } from './KeyCombo';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Data Display/KeyCombo',
  component: KeyCombo,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof KeyCombo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Combos: Story = {
  args: { sequence: ['Mod+k'] },
  render: () => (
    <div className="flex items-center gap-4">
      <KeyCombo sequence={['Mod+k']} />
      <KeyCombo sequence={['g', 'i']} />
      <KeyCombo sequence={['Escape']} />
      <KeyCombo sequence={['Mod+Shift+Enter']} />
    </div>
  ),
};

export const NamedKeys: Story = {
  args: { sequence: ['ArrowUp', 'ArrowDown', 'Backspace', 'Space'] },
};

export const ModifierOrder: Story = {
  args: { sequence: ['Mod+Alt+Shift+k'] },
};
