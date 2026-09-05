import { CheckpointSourceBadge } from './CheckpointSourceBadge';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof CheckpointSourceBadge> = {
  title: 'Finance/CheckpointSourceBadge',
  component: CheckpointSourceBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Manual: Story = {
  args: { source: 'manual' },
};

export const Import: Story = {
  args: { source: 'import' },
};

export const Statement: Story = {
  args: { source: 'statement' },
};

export const AllSources: Story = {
  render: () => (
    <div className="flex gap-2">
      <CheckpointSourceBadge source="manual" />
      <CheckpointSourceBadge source="import" />
      <CheckpointSourceBadge source="statement" />
    </div>
  ),
};
