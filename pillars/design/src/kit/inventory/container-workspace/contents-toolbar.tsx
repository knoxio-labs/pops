/**
 * The contents pane's top line: how many things are directly inside and
 * how many more sit in containers inside it, the filter, and Unpack.
 */
import { Button } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';

import type { ReactNode } from 'react';

import type { UnpackAction, UnpackState } from './unpack-model';

/** Props for {@link ContentsToolbar}. */
export interface ContentsToolbarProps {
  count: number;
  nested: number;
  state: UnpackState;
  dispatch: (action: UnpackAction) => void;
  readOnly: boolean;
  search: ReactNode;
}

function countLine(count: number, nested: number): string {
  const direct = `${count} directly inside`;
  return nested > 0 ? `${direct}, ${nested} more nested` : direct;
}

/** The toolbar. */
export function ContentsToolbar({
  count,
  nested,
  state,
  dispatch,
  readOnly,
  search,
}: ContentsToolbarProps) {
  const TakeOut = INVENTORY_ICONS.takeOut;
  const canUnpack = !readOnly && state.phase === 'browse' && state.access === 'open' && count > 0;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">Contents</h2>
        <p className="truncate text-xs text-muted-foreground">{countLine(count, nested)}</p>
      </div>
      {search}
      {state.phase === 'browse' ? (
        <Button
          size="sm"
          variant="outline"
          prefix={<TakeOut className="size-4" aria-hidden />}
          aria-disabled={!canUnpack || undefined}
          title={state.access === 'closed' ? 'Closed. Open it to unpack.' : undefined}
          className={canUnpack ? undefined : 'opacity-50'}
          onClick={canUnpack ? () => dispatch({ type: 'start' }) : undefined}
        >
          Unpack
        </Button>
      ) : null}
    </div>
  );
}
