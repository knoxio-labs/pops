import { useState } from 'react';

import { Button } from './Button';
import { Select } from './Select';
import { Sheet, SheetPanel } from './Sheet';
import { TextInput } from './TextInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Sheet> = {
  title: 'Feedback/Sheet',
  component: Sheet,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const FIELDS = [
  { value: 'manufacturer', label: 'Manufacturer, 9 of 14 have it' },
  { value: 'powered', label: 'Needs power, 9 of 14 have it' },
  { value: 'brand', label: 'Brand, 5 of 14 have it' },
];

const TITLE = 'Set a field on 14 items';
const DESCRIPTION = 'Items whose type lacks the field are left as they are.';

function SheetBody(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Select
          id="bulk-field"
          label="Field"
          value="manufacturer"
          options={FIELDS}
          onChange={() => undefined}
        />
      </div>
      <div className="space-y-1.5">
        <TextInput id="bulk-value" label="Manufacturer" defaultValue="LG" />
        <p className="text-xs text-muted-foreground">
          Replaces the current value on 9 items. Each change can be undone from its history.
        </p>
      </div>
    </div>
  );
}

function SheetFooter(): React.ReactElement {
  return (
    <>
      <Button variant="ghost">Cancel</Button>
      <Button>Set on 9 items</Button>
    </>
  );
}

export const SetField: Story = {
  render: () => (
    <div className="flex h-128 justify-end">
      <SheetPanel title={TITLE} description={DESCRIPTION} footer={<SheetFooter />}>
        <SheetBody />
      </SheetPanel>
    </div>
  ),
};

export const Open: Story = {
  render: () => {
    const [open, setOpen] = useState(true);

    return (
      <div className="min-h-screen p-4">
        <Button onClick={() => setOpen(true)}>Open sheet</Button>
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={TITLE}
          description={DESCRIPTION}
          footer={<SheetFooter />}
        >
          <SheetBody />
        </Sheet>
      </div>
    );
  },
};
