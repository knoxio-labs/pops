import { Button } from '@pops/ui';

import { INVENTORY_ICONS } from '../../../foundation/model/icons.js';

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
}

function countLine(count: number, nested: number): string {
  const direct = `${count} directly inside`;
  return nested > 0 ? `${direct}, ${nested} more nested` : direct;
}

/** Renders the direct-content count, filter, and Unpack action. */
export function ContentsToolbar({
  count,
  nested,
  state,
  dispatch,
  readOnly,
  readOnlyReason,
  search,
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
