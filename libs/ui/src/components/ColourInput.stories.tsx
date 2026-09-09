import { useState } from 'react';

import { ColourInput } from './ColourInput';

/**
 * ColourInput component stories
 */
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ColourInput> = {
  component: ColourInput,
  title: 'Inputs/Colour',
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'Disables the text field and the swatch',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ColourInput>;

export const Default: Story = {
  args: {
    label: 'Colour',
    defaultValue: '#0ea5e9',
  },
};

export const Uncontrolled: Story = {
  args: {
    label: 'Colour',
    defaultValue: '#22c55e',
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [value, setValue] = useState('#a855f7');
    return <ColourInput {...args} label="Colour" value={value} onChange={setValue} />;
  },
};

export const InvalidHex: Story = {
  args: {
    label: 'Colour',
    defaultValue: 'not-a-colour',
  },
};

export const ExternalError: Story = {
  args: {
    label: 'Colour',
    defaultValue: '#0ea5e9',
    error: 'Colour is required',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Colour',
    defaultValue: '#0ea5e9',
    disabled: true,
  },
};

export const NoLabel: Story = {
  args: {
    defaultValue: '#f97316',
  },
};
