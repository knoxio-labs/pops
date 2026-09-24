/**
 * Adding to the job: search the catalogue by name or code and add an item.
 * Items already in the job show as added. A box's contents are added from
 * its row in the selection once the box is in.
 */
import { Check, Tag } from 'lucide-react';
import { useState } from 'react';

import { Button, SearchPickerDialog } from '@pops/ui';

import { useInventorySearch } from '../../inventory-web/useInventorySearch.js';

import type { ReactElement } from 'react';

/** One item the search found, as the dialog lists it. */
export interface AddCandidate {
  id: string;
  name: string;
  code: string | null;
}

const ITEM_URI_PREFIX = '/inventory/items/';

/** Reads a search hit into a candidate; a hit that is not an item reads as null. */
export function toCandidate(hit: {
  uri: string;
  data: Record<string, unknown>;
}): AddCandidate | null {
  if (!hit.uri.startsWith(ITEM_URI_PREFIX)) return null;
  const id = hit.uri.slice(ITEM_URI_PREFIX.length);
  const name = hit.data['itemName'];
  const code = hit.data['assetId'];
  if (!id || typeof name !== 'string') return null;
  return { id, name, code: typeof code === 'string' ? code : null };
}

/** Props for {@link AddDialog}. */
export interface AddDialogProps {
  trigger: ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: ReadonlySet<string>;
  onAdd: (ids: string[]) => void;
}

function Result({
  candidate,
  added,
  onAdd,
}: {
  candidate: AddCandidate;
  added: boolean;
  onAdd: (ids: string[]) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <Tag className="size-4 shrink-0 text-app-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{candidate.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {candidate.code ?? 'No code'}
        </p>
      </div>
      {added ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
          Added
        </span>
      ) : (
        <Button size="sm" variant="outline" onClick={() => onAdd([candidate.id])}>
          Add
        </Button>
      )}
    </div>
  );
}

/** The search dialog that adds items to the job. */
export function AddDialog(props: AddDialogProps) {
  const [search, setSearch] = useState('');
  const query = useInventorySearch(search);
  const results = (query.data?.hits ?? []).flatMap((hit) => {
    const candidate = toCandidate(hit);
    return candidate ? [candidate] : [];
  });
  return (
    <SearchPickerDialog
      trigger={props.trigger}
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Add to labels"
      searchPlaceholder="Name or code"
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isFetching}
      results={results}
      getResultKey={(candidate) => candidate.id}
      minChars={1}
      maxResultsHeight="max-h-80"
      emptyMessage="No items match"
      renderResult={(candidate) => (
        <Result
          candidate={candidate}
          added={props.selectedIds.has(candidate.id)}
          onAdd={props.onAdd}
        />
      )}
    />
  );
}
