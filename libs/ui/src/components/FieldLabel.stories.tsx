import { FieldLabel } from './FieldLabel';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * FieldLabel component stories
 * Demonstrates the required marker, error, and description slots.
 */
const meta: Meta<typeof FieldLabel> = {
  component: FieldLabel,
  title: 'Inputs/FieldLabel',
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Visible label text',
    },
    required: {
      control: 'boolean',
      description: 'Shows a required marker next to the label',
    },
    error: {
      control: 'text',
      description: 'Error message, shown instead of the description',
    },
    description: {
      control: 'text',
      description: 'Optional hint line, hidden while an error is present',
    },
  },
  decorators: [
    (Story) => (
      <div className="flex flex-col gap-1.5 w-64">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FieldLabel>;

export const Default: Story = {
  args: {
    htmlFor: 'account-name',
    label: 'Account name',
  },
};

export const Required: Story = {
  args: {
    htmlFor: 'account-name',
    label: 'Account name',
    required: true,
  },
};

export const WithDescription: Story = {
  args: {
    htmlFor: 'account-name',
    label: 'Account name',
    description: 'Shown on statements and exports.',
  },
};

export const WithError: Story = {
  args: {
    htmlFor: 'account-name',
    label: 'Account name',
    required: true,
    error: 'Account name is required.',
  },
};
