import { QrCodePopover } from './QrCodePopover';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof QrCodePopover> = {
  title: 'Data Display/QrCodePopover',
  component: QrCodePopover,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { value: 'pops-i://CAB-012', label: 'CAB-012' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The icon opens the QR and copies the link using the browser clipboard. */
export const Default: Story = {};
