import { useState } from 'react';

import { Button } from './Button';
import { SearchPickerDialog } from './SearchPickerDialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SearchPickerDialog<string>> = {
  title: 'Overlays/SearchPickerDialog',
  component: SearchPickerDialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AccessibleSearch: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    return (
      <SearchPickerDialog
        trigger={<Button variant="outline">Open chooser</Button>}
        open={open}
        onOpenChange={setOpen}
        title="Choose a contact"
        description="Search existing contacts."
        searchPlaceholder="Search contacts"
        searchLabel="Search contacts"
        search={search}
        onSearchChange={setSearch}
        isLoading={false}
        results={search.length > 1 ? ['Harbour Books'] : []}
        renderResult={(result) => (
          <button type="button" className="min-h-11 w-full text-left">
            {result}
          </button>
        )}
        getResultKey={(result) => result}
        minCharsMessage="Type at least 2 characters to search."
        emptyMessage="No matching contacts."
      />
    );
  },
};
