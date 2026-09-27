import { MapPin } from 'lucide-react';

import { highlightMatch } from '@pops/ui';

import { RowVerb } from '../../foundation/rows/item-row.js';
import { ResultRowFrame, stopRowClick } from './result-row-frame.js';

import type { SearchPlaceHit } from '../../inventory-web/useWebSearch.js';

/** Props for a place result row. */
export interface PlaceResultRowProps {
  readonly hit: SearchPlaceHit;
  readonly query: string;
  readonly active: boolean;
  readonly onActivate: () => void;
  readonly onOpen: () => void;
}

/** Renders a ranked inventory place result. */
export function PlaceResultRow({ hit, query, active, onActivate, onOpen }: PlaceResultRowProps) {
  return (
    <ResultRowFrame id={hit.place.id} kind="place" active={active} onActivate={onActivate}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <MapPin className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">
          {highlightMatch(hit.place.name, query, hit.tier)}
        </span>
        <span className="text-xs text-muted-foreground">Place</span>
      </span>
      <span onClick={stopRowClick}>
        <RowVerb icon={MapPin} label="Open place" onClick={onOpen} />
      </span>
    </ResultRowFrame>
  );
}
