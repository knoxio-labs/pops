import { FragileIcon } from './FragileIcon';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof FragileIcon> = {
  title: 'Inventory/FragileIcon',
  component: FragileIcon,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PrintInk: Story = {
  render: () => <FragileIcon className="text-print-ink" size="24mm" />,
};
