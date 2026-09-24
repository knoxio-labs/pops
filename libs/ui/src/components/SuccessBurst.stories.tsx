import { useState } from 'react';

import { Button } from './Button';
import { SuccessBurst, type SuccessBurstProps } from './SuccessBurst';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SuccessBurst> = {
  title: 'Feedback/SuccessBurst',
  component: SuccessBurst,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    label: 'Device paired',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The burst plays once, on mount. Re-keying it is how a caller plays it again.
 */
export const Replay: Story = {
  render: (args) => <ReplayDemo {...args} />,
};

function ReplayDemo(args: SuccessBurstProps) {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col items-center gap-4">
      <SuccessBurst key={run} {...args} />
      <Button variant="outline" onClick={() => setRun((n) => n + 1)}>
        Play again
      </Button>
    </div>
  );
}

export const OnDarkSurface: Story = {
  render: (args) => (
    <div className="dark bg-background p-8">
      <SuccessBurst {...args} />
    </div>
  ),
};
