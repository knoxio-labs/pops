import { Cable, Search, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, EmptyState, Skeleton, TextInput } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { ListError } from '../../foundation/list-page/list-states.js';
import { WireItemOption } from './wire-item-option.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WireItemsState } from './wire-items-types.js';

/** Returns the refusal reason for an item that cannot be wired to the fixture. */
export function wireItemRefusal(item: ItemRowModel, wiredIds: ReadonlySet<string>): string | null {
  if (wiredIds.has(item.id)) return 'Already wired here.';
  if (item.lifecycle !== 'active') return `${item.name} is ${item.lifecycle}.`;
  return null;
}

function WireItemsEmpty({ filtered }: { readonly filtered: boolean }): ReactElement {
  return (
    <EmptyState
      icon={filtered ? X : Cable}
      title={filtered ? 'No items match' : 'No items available to wire'}
      description={
        filtered
          ? 'Try a different item name.'
          : 'Only active items outside containers can be wired.'
      }
    />
  );
}

function WireItemsCandidateList({ state }: { readonly state: WireItemsState }): ReactElement {
  return (
    <div
      role="listbox"
      aria-label={`Items available to wire to ${state.fixture.name}`}
      className="grid gap-1"
    >
      {state.candidates.map((item) => (
        <WireItemOption
          key={item.id}
          item={item}
          selected={state.selectedIds.has(item.id)}
          refusal={wireItemRefusal(item, state.wiredIds)}
          onToggle={() => state.toggle(item)}
        />
      ))}
    </div>
  );
}

function WireItemsSourceState({ state }: { readonly state: WireItemsState }): ReactElement {
  if (state.itemRows.status === 'pending') {
    return (
      <div role="status" aria-label="Loading items to wire" className="grid gap-2">
        {['one', 'two', 'three', 'four'].map((key) => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (state.itemRows.status === 'error') {
    return <ListError noun="items" onRetry={state.itemRows.refetch} />;
  }
  if (state.candidates.length === 0) {
    return <WireItemsEmpty filtered={state.queryDraft.trim().length > 0} />;
  }
  return <WireItemsCandidateList state={state} />;
}

/** Renders the item-source search, refusal feedback, and server pagination. */
export function WireItemsContent({ state }: { readonly state: WireItemsState }): ReactElement {
  return (
    <div className="grid gap-3">
      <TextInput
        value={state.queryDraft}
        maxLength={200}
        placeholder="Find an item"
        aria-label="Find items to wire"
        prefix={<Search className="size-4" aria-hidden />}
        clearable
        onClear={() => state.setQueryDraft('')}
        onChange={(event) => state.setQueryDraft(event.target.value)}
      />
      {!state.online ? (
        <Alert>
          <AlertTitle>Wiring is unavailable offline</AlertTitle>
          <AlertDescription>{OFFLINE_REASON}</AlertDescription>
        </Alert>
      ) : null}
      {state.error !== null ? (
        <Alert variant="destructive">
          <AlertTitle>Items were not wired</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <WireItemsSourceState state={state} />
    </div>
  );
}
