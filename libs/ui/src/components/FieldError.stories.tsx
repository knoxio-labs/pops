import { DateInput } from './DateTimeInput';
import { FieldError } from './FieldError';
import { FieldLabel } from './FieldLabel';
import { TextInput } from './TextInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * FieldError component stories.
 *
 * The one place a form control's error message is drawn — `FieldLabel`,
 * `TextInput` and the date/time inputs all render through it, so the three
 * copies that used to exist cannot drift apart again.
 *
 * The stories worth looking at are the last two: they are the convention it
 * exists to hold, and the mismatch that made POPS-3247 a ticket.
 */
const meta: Meta<typeof FieldError> = {
  component: FieldError,
  title: 'Inputs/FieldError',
  tags: ['autodocs'],
  argTypes: {
    htmlFor: {
      control: 'text',
      description: "The control's id; the paragraph's own id is derived from it",
    },
    error: {
      control: 'text',
      description: 'The message. Nothing renders when absent',
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
type Story = StoryObj<typeof FieldError>;

export const Default: Story = {
  args: {
    htmlFor: 'account-name',
    error: 'Account name is required.',
  },
};

/** Nothing renders without a message, so no line is reserved for one. */
export const Empty: Story = {
  args: {
    htmlFor: 'account-name',
  },
};

/**
 * Below the control, which is where every kit input with an `error` prop of
 * its own puts its message.
 */
export const BelowTheControl: Story = {
  render: () => (
    <>
      <TextInput id="amount" label="Amount" prefix="$" error="Enter an amount." />
      <FieldLabel htmlFor="when" label="When" />
      <DateInput id="when" error="Pick a date." />
    </>
  ),
};

/**
 * What POPS-3247 was about, kept as a picture of the thing not to build: a
 * message passed to `FieldLabel` renders inside the label block, so it lands
 * ABOVE its control — and beside a field that renders below, one row shows two
 * messages at two heights. `FieldLabel`'s slot is for a control with no
 * `error` prop of its own; anything else should use the control's.
 */
export const AboveTheControl: Story = {
  render: () => (
    <>
      <FieldLabel htmlFor="category" label="Category" error="Choose a category." />
      <select id="category" className="border border-border rounded-md h-11 px-3 text-sm">
        <option>Groceries</option>
      </select>
    </>
  ),
};
