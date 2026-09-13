import { Link2 } from 'lucide-react';
import { useState } from 'react';

import { AssetIdBadge, Button, SearchPickerDialog, TypeBadge } from '@pops/ui';

import type { ConnectCandidateItem } from './types';

interface ConnectResultRowProps {
  item: ConnectCandidateItem;
  disabled: boolean;
  onConnect: (itemId: string) => void;
}

function ConnectResultRow({ item, disabled, onConnect }: ConnectResultRowProps) {
  const hasMeta = ((item.brand ?? item.model) || item.assetId) ?? item.type;
  return (
    <Button
      variant="ghost"
      className="w-full flex items-center justify-between p-2.5 h-auto text-left"
      onClick={() => onConnect(item.id)}
      disabled={disabled}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.itemName}</div>
        {hasMeta ? (
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {(item.brand ?? item.model) && (
              <span className="text-xs text-muted-foreground">
                {[item.brand, item.model].filter(Boolean).join(' · ')}
              </span>
            )}
            {item.assetId && <AssetIdBadge assetId={item.assetId} />}
            {item.type && <TypeBadge type={item.type} />}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground mt-0.5">No details</span>
        )}
      </div>
      <Link2 className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
    </Button>
  );
}

export interface ConnectDialogProps {
  currentItemId: string;
  /** Search results the screen driving this control found, in place of the generated client's search. */
  candidateItems: ConnectCandidateItem[];
  isLoading: boolean;
  error?: string | null;
  onSearchChange?: (search: string) => void;
  onConnect?: (itemBId: string) => void;
  /**
   * Starts the dialog open. The app has no such prop: it exists because the
   * canvas renders a state once and cannot press anything, so a design state
   * showing the dialog needs a way in that is not a click.
   */
  defaultOpen?: boolean;
  /**
   * Seeds the dialog's own search box. Same reason as `defaultOpen`: the
   * results list stays behind a "type at least 2 characters" prompt until
   * something types, and on the canvas nothing does.
   */
  defaultSearch?: string;
}

export function ConnectDialog({
  currentItemId,
  candidateItems,
  isLoading,
  error = null,
  onSearchChange,
  onConnect = () => {},
  defaultOpen = false,
  defaultSearch = '',
}: ConnectDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [search, setSearch] = useState(defaultSearch);

  const results = candidateItems.filter((item) => item.id !== currentItemId);

  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch('');
      }}
      trigger={
        <Button variant="outline" size="sm">
          <Link2 className="h-4 w-4 mr-1.5" />
          Connect Item
        </Button>
      }
      title="Connect Item"
      description="Search for an item to connect by name or asset ID."
      searchPlaceholder="Search items..."
      emptyMessage={error ?? 'No items found'}
      getResultKey={(item: ConnectCandidateItem) => item.id}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        onSearchChange?.(value);
      }}
      isLoading={isLoading}
      results={results}
      renderResult={(item: ConnectCandidateItem) => (
        <ConnectResultRow item={item} disabled={false} onConnect={onConnect} />
      )}
    />
  );
}
