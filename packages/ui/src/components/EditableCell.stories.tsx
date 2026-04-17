import { useState } from 'react';

import { EditableCell } from './EditableCell';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof EditableCell> = {
  title: 'Data Display/EditableCell',
  component: EditableCell,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Wrapper to hold stateful value for interactive stories
function EditableCellWrapper(props: React.ComponentProps<typeof EditableCell>) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="w-64">
      <EditableCell
        {...props}
        value={value}
        onSave={(v) => {
          setValue(v as never);
          return Promise.resolve();
        }}
      />
    </div>
  );
}

export const DisplayMode: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell value="Click to edit" onSave={() => {}} />
    </div>
  ),
};

export const TextEdit: Story = {
  render: () => <EditableCellWrapper value="Editable text" type="text" onSave={() => {}} />,
};

export const NumberEdit: Story = {
  render: () => <EditableCellWrapper value={42} type="number" onSave={() => {}} />,
};

export const DateEdit: Story = {
  render: () => (
    <EditableCellWrapper
      value="2024-06-15"
      type="date"
      onSave={() => {}}
      placeholder="YYYY-MM-DD"
    />
  ),
};

export const SelectEdit: Story = {
  render: () => (
    <EditableCellWrapper
      value="active"
      type="select"
      options={[
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Pending', value: 'pending' },
      ]}
      onSave={() => {}}
    />
  ),
};

export const ValidationError: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell
        value=""
        type="text"
        placeholder="Required field"
        validate={(v) => (String(v).trim().length > 0 ? true : 'Value is required')}
        onSave={() => {}}
      />
    </div>
  ),
};

export const SavingState: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell
        value="Slow save"
        type="text"
        onSave={() => new Promise((resolve) => setTimeout(resolve, 3000))}
      />
    </div>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <div className="w-64">
      <EditableCell value="Read-only value" editable={false} onSave={() => {}} />
    </div>
  ),
};
