import { PurchaseResultRow } from './purchase-result-row.js';
import { ResultSectionHeading } from './result-section.js';
import { searchResultDomId } from './search-model.js';

import type { KeyboardEvent } from 'react';

import type { PurchaseHit } from '../../inventory-web/purchase-model.js';

/** Props for the purchases listbox. */
export interface PurchasesListProps {
  readonly query: string;
  readonly hits: readonly PurchaseHit[];
  readonly activeId: string | null;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onActivate: (id: string) => void;
  readonly onOpen: (id: string) => void;
}

/** Renders the purchases scope in the same keyboard-accessible listbox shape. */
export function PurchasesList(props: PurchasesListProps) {
  return (
    <div
      role="listbox"
      aria-label="Purchase search results"
      aria-activedescendant={
        props.activeId === null ? undefined : searchResultDomId('purchase', props.activeId)
      }
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ResultSectionHeading title="Purchases" count={props.hits.length} />
      {props.hits.map((hit) => (
        <PurchaseResultRow
          key={hit.id}
          hit={hit}
          query={props.query}
          active={props.activeId === hit.id}
          onActivate={() => props.onActivate(hit.id)}
          onOpen={() => props.onOpen(hit.id)}
        />
      ))}
    </div>
  );
}
