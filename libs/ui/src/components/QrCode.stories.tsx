import { QrCode } from './QrCode';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof QrCode> = {
  title: 'Data Display/QrCode',
  component: QrCode,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    value: 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND',
    title: 'Scan to pair this device',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The symbol keeps its dark-on-light palette in dark mode. Inverting it would
 * look better and scan worse — see the `--qr-module` comment in `globals.css`.
 */
export const OnDarkSurface: Story = {
  render: (args) => (
    <div className="dark bg-background p-8">
      <QrCode {...args} />
    </div>
  ),
};

/**
 * Error correction trades symbol density for damage tolerance. `H` recovers
 * ~30% of a damaged code and is visibly denser at the same payload.
 */
export const ErrorCorrectionLevels: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-start gap-6">
      {(['L', 'M', 'Q', 'H'] as const).map((level) => (
        <figure key={level} className="space-y-2">
          <QrCode {...args} errorCorrectionLevel={level} className="w-40" />
          <figcaption className="text-center text-xs text-muted-foreground">{level}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

/**
 * A longer payload picks a higher QR version — more modules in the same box,
 * which is where a too-small render stops scanning.
 */
export const PayloadLengths: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-start gap-6">
      {['POPS', 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND'].map((value) => (
        <figure key={value} className="space-y-2">
          <QrCode {...args} value={value} className="w-40" />
          <figcaption className="max-w-40 text-center text-xs break-all text-muted-foreground">
            {value}
          </figcaption>
        </figure>
      ))}
    </div>
  ),
};
