import { Puzzle } from 'lucide-react';
import { useState } from 'react';

import { SearchPickerDialog } from '@pops/ui';

import { ItemSearchResultRow, useItemSearch, type SearchableItem } from './ItemSearchResult.js';

import type { ReactElement } from 'react';

interface AddPartDialogProps {
  assemblyItemId: string;
  trigger: ReactElement;
  isAdding: boolean;
  onPick: (partItemId: string) => void;
}

/** Searches inventory items and hands the picked one back as a new part of the assembly. */
export function AddPartDialog({ assemblyItemId, trigger, isAdding, onPick }: AddPartDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { isLoading, results } = useItemSearch(open, search, assemblyItemId);

  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setSearch('');
      }}
      trigger={trigger}
      title="Add part"
      description="Search for the item that is a part of this one, by name or asset ID."
      searchPlaceholder="Search items..."
      emptyMessage="No items found"
      getResultKey={(item: SearchableItem) => item.id}
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      results={results}
      renderResult={(item: SearchableItem) => (
        <ItemSearchResultRow
          item={item}
          icon={Puzzle}
          disabled={isAdding}
          onPick={(partItemId) => {
            onPick(partItemId);
            setOpen(false);
            setSearch('');
          }}
        />
      )}
    />
  );
}
