import { ArrowDownAZ, ChevronDown } from 'lucide-react';

import { Button } from '@pops/ui';
import {
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from '@pops/ui';

import { INVENTORY_ICONS } from '../../../foundation/model/icons.js';
import { CONTENTS_SORT_OPTIONS, type ContentsSort } from './contents-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { UnpackAction, UnpackState } from './unpack-model.js';

/** Props for the container contents toolbar. */
export interface ContentsToolbarProps {
  count: number;
  nested: number;
  state: UnpackState;
  dispatch: (action: UnpackAction) => void;
  readOnly: boolean;
  readOnlyReason?: string;
  search: ReactNode;
  sort: ContentsSort;
  onSort: (sort: ContentsSort) => void;
}

function countLine(count: number, nested: number): string {
  const direct = `${count} directly inside`;
  return nested > 0 ? `${direct}, ${nested} more nested` : direct;
}

const SORT_LABELS: Record<ContentsSort, string> = {
  'name-asc': 'Name (A–Z)',
  'name-desc': 'Name (Z–A)',
};

function isContentsSort(value: string): value is ContentsSort {
  return CONTENTS_SORT_OPTIONS.some((option) => option === value);
}

function ContentsSortMenu({
  sort,
  onSort,
}: Pick<ContentsToolbarProps, 'sort' | 'onSort'>): ReactElement {
  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label="Sort contents"
          prefix={<ArrowDownAZ className="size-4" aria-hidden />}
          suffix={<ChevronDown className="size-4" aria-hidden />}
        >
          {SORT_LABELS[sort]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => {
            if (isContentsSort(value)) onSort(value);
          }}
        >
          {CONTENTS_SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {SORT_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}

/** Renders the direct-content count, filter, sort menu, and Unpack action. */
export function ContentsToolbar({
  count,
  nested,
  state,
  dispatch,
  readOnly,
  readOnlyReason,
  search,
  sort,
  onSort,
}: ContentsToolbarProps): ReactElement {
  const TakeOut = INVENTORY_ICONS.takeOut;
  const reason =
    readOnlyReason ??
    (state.access === 'closed' ? 'Closed. Open it to unpack.' : undefined) ??
    (count === 0 ? 'There is nothing to unpack.' : undefined);
  const canUnpack = !readOnly && state.phase === 'browse' && state.access === 'open' && count > 0;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">Contents</h2>
        <p className="truncate text-xs text-muted-foreground">{countLine(count, nested)}</p>
      </div>
      {search}
      {count > 0 ? <ContentsSortMenu sort={sort} onSort={onSort} /> : null}
      {state.phase === 'browse' ? (
        <Button
          size="sm"
          variant="outline"
          prefix={<TakeOut className="size-4" aria-hidden />}
          disabled={!canUnpack}
          title={reason}
          onClick={() => dispatch({ type: 'start' })}
        >
          Unpack
        </Button>
      ) : null}
    </div>
  );
}
