import { FIELD_ICON_OPTIONS, FieldIcon } from './FieldIcon';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Data Display/FieldIcon',
  component: FieldIcon,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    name: 'PackageOpenUp',
  },
} satisfies Meta<typeof FieldIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllOptions: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-6 text-2xl sm:grid-cols-4">
      {FIELD_ICON_OPTIONS.map((option) => (
        <figure key={option.value} className="flex flex-col items-center gap-2">
          <FieldIcon name={option.value} />
          <figcaption className="text-center text-xs text-muted-foreground">
            {option.label}
          </figcaption>
        </figure>
      ))}
    </div>
  ),
};

export const PrintedLabel: Story = {
  render: () => (
    <div className="flex items-center gap-3 border border-border bg-background p-4 text-foreground">
      <FieldIcon name="PackageOpenUp" size="8mm" />
      <div>
        <div className="text-sm font-semibold">Return to storage</div>
        <div className="text-xs text-muted-foreground">Shelf B · Box 14</div>
      </div>
    </div>
  ),
};
