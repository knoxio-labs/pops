import { Sparkline } from './Sparkline';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Sparkline> = {
  title: 'Data/Sparkline',
  component: Sparkline,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

const series = (values: number[]) =>
  values.map((value, index) => ({ label: MONTHS[index] ?? String(index), value }));

export const Rising: Story = {
  args: { points: series([390, 396, 401, 399, 407, 412, 410, 418, 421, 419, 425, 428]) },
  render: (args) => (
    <div className="w-64">
      <Sparkline {...args} className="text-primary" />
    </div>
  ),
};

export const Falling: Story = {
  args: {
    points: series([-180, -186, -191, -188, -195, -201, -198, -205, -209, -207, -211, -214]),
  },
  render: (args) => (
    <div className="w-64">
      <Sparkline {...args} className="text-destructive" />
    </div>
  ),
};

/** A liability climbing toward zero is still debt, and stays in the debt tone. */
export const DebtClearing: Story = {
  args: {
    points: series([-620, -608, -595, -583, -570, -558, -545, -533, -520, -508, -495, -483]),
  },
  render: (args) => (
    <div className="w-64">
      <Sparkline {...args} className="text-destructive" />
    </div>
  ),
};

export const Unfilled: Story = {
  args: { points: series([12, 18, 15, 22, 19, 25, 21, 28, 24, 31, 27, 34]), filled: false },
  render: (args) => (
    <div className="w-64">
      <Sparkline {...args} />
    </div>
  ),
};

/** One reading is not a trend — the component renders nothing rather than a flat line. */
export const TooFewPoints: Story = {
  args: { points: series([42]) },
  render: (args) => (
    <div className="w-64 border border-dashed border-border p-2 text-xs text-muted-foreground">
      <Sparkline {...args} />
      Nothing is drawn above this line.
    </div>
  ),
};
