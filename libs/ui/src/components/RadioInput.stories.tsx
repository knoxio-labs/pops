import { useState } from 'react';

import { RadioInput } from './RadioInput';
import { TextInput } from './TextInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof RadioInput> = {
  title: 'Inputs/Radio',
  component: RadioInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: '400px', padding: '2rem' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const planOptions = [
  {
    label: 'Free',
    value: 'free',
    description: 'Basic features for personal use',
  },
  {
    label: 'Pro',
    value: 'pro',
    description: 'Advanced features for professionals',
  },
  {
    label: 'Enterprise',
    value: 'enterprise',
    description: 'Custom solutions for teams',
  },
];

const paymentOptions = [
  { label: 'Credit Card', value: 'credit' },
  { label: 'PayPal', value: 'paypal' },
  { label: 'Bank Transfer', value: 'bank' },
];

const sizeOptions = [
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
  { label: 'Extra Large', value: 'xl' },
];

export const Default: Story = {
  args: {},
  render: () => {
    const [plan, setPlan] = useState('free');
    return (
      <RadioInput
        label="Select a plan"
        options={planOptions}
        value={plan}
        onValueChange={setPlan}
      />
    );
  },
};

export const WithDescription: Story = {
  args: {},
  render: () => {
    const [plan, setPlan] = useState('pro');
    return (
      <RadioInput
        label="Choose your subscription"
        description="Select the plan that best fits your needs"
        options={planOptions}
        value={plan}
        onValueChange={setPlan}
      />
    );
  },
};

export const Required: Story = {
  args: {},
  render: () => {
    const [payment, setPayment] = useState('');
    return (
      <RadioInput
        label="Payment method"
        options={paymentOptions}
        value={payment}
        onValueChange={setPayment}
        required
      />
    );
  },
};

export const WithError: Story = {
  args: {},
  render: () => {
    const [payment, setPayment] = useState('');
    return (
      <RadioInput
        label="Payment method"
        description="Please select how you would like to pay"
        options={paymentOptions}
        value={payment}
        onValueChange={setPayment}
        required
        error
        errorMessage="Please select a payment method to continue"
      />
    );
  },
};

export const Horizontal: Story = {
  args: {},
  render: () => {
    const [size, setSize] = useState('md');
    return (
      <RadioInput
        label="Select size"
        options={sizeOptions}
        value={size}
        onValueChange={setSize}
        orientation="horizontal"
      />
    );
  },
};

export const WithDisabledOption: Story = {
  args: {},
  render: () => {
    const [plan, setPlan] = useState('free');
    return (
      <RadioInput
        label="Select a plan"
        options={[
          { label: 'Free', value: 'free', description: 'Basic features' },
          { label: 'Pro', value: 'pro', description: 'Advanced features' },
          {
            label: 'Enterprise',
            value: 'enterprise',
            description: 'Coming soon',
            disabled: true,
          },
        ]}
        value={plan}
        onValueChange={setPlan}
      />
    );
  },
};

export const Disabled: Story = {
  args: {},
  render: () => {
    return (
      <RadioInput
        label="Select a plan"
        description="This selection is currently disabled"
        options={planOptions}
        value="pro"
        disabled
      />
    );
  },
};

export const DefaultValue: Story = {
  args: {},
  render: () => {
    return (
      <RadioInput
        label="Select a plan"
        description="Pro plan is pre-selected"
        options={planOptions}
        defaultValue="pro"
      />
    );
  },
};

export const SimpleOptions: Story = {
  args: {},
  render: () => {
    const [answer, setAnswer] = useState('');
    return (
      <RadioInput
        label="Do you agree?"
        options={[
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ]}
        value={answer}
        onValueChange={setAnswer}
        orientation="horizontal"
      />
    );
  },
};

/**
 * `size` scales the option labels. It exists because the label's own
 * `text-sm` beat any class a parent set, which kept a compact inline toggle
 * hand-composing the primitives (POPS-3298).
 */
export const Sizes: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState('sm');
    return (
      <div className="flex flex-col gap-6">
        {(['sm', 'default', 'lg'] as const).map((size) => (
          <RadioInput
            key={size}
            label={size}
            size={size}
            options={[
              { label: 'Ingredient', value: 'sm' },
              { label: 'Variant', value: 'default' },
            ]}
            value={value}
            onValueChange={setValue}
            orientation="horizontal"
          />
        ))}
      </div>
    );
  },
};

/**
 * An option that owns the controls it governs — the radio-card shape. The
 * body stays mounted whichever option is selected, so a half-typed name is
 * not lost by clicking the other choice and back.
 */
export const WithOptionBody: Story = {
  args: {},
  render: () => {
    const [target, setTarget] = useState('existing');
    const [name, setName] = useState('Shopping list — 2026-09-11');
    return (
      <RadioInput
        label="Send to"
        value={target}
        onValueChange={setTarget}
        options={[
          {
            label: 'Add to existing',
            value: 'existing',
            body: (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                <li>Weeknight staples · 12 items</li>
                <li>Party · 4 items</li>
              </ul>
            ),
          },
          {
            label: 'Create new',
            value: 'new',
            body: (
              <TextInput
                aria-label="New list name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                disabled={target !== 'new'}
              />
            ),
          },
        ]}
      />
    );
  },
};
