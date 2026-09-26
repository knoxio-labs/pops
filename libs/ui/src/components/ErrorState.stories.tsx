import { ErrorState } from './ErrorAlert';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ErrorState> = {
  title: 'Feedback/ErrorState',
  component: ErrorState,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    error: {
      code: 'inventory.items.not_found',
      message: 'Item not found',
      requestId: '01K5EXAMPLE123',
      retryable: false,
    },
  },
};

export const Retryable: Story = {
  args: {
    error: {
      code: 'web.net.offline',
      message: 'The request could not reach the server',
      retryable: true,
    },
    onRetry: () => undefined,
  },
};
