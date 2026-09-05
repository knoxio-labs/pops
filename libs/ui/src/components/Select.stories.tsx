import { Select } from './Select';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Select component stories
 */
const meta: Meta<typeof Select> = {
  component: Select,
  title: 'Inputs/Select',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'ghost', 'underline'],
      description: 'Visual style variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg'],
      description: 'Size of the select',
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the select',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit-card', label: 'Credit card' },
];

export const Default: Story = {
  args: {
    options,
    placeholder: 'Choose an account kind...',
  },
};

/**
 * Passing `label` alone is enough to give the control an accessible name —
 * the label is associated with the select via a generated `id`/`htmlFor`
 * pair, so a screen reader announces "Account kind" rather than a bare
 * combobox.
 */
export const WithLabel: Story = {
  args: {
    label: 'Account kind',
    options,
    placeholder: 'Choose an account kind...',
  },
};

export const WithError: Story = {
  args: {
    label: 'Account kind',
    options,
    error: 'Select an account kind',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Account kind',
    options,
    disabled: true,
  },
};
