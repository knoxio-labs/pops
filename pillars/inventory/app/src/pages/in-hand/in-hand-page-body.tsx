import { Card, EmptyState, Skeleton } from '@pops/ui';

import { LoadError } from '../../foundation/frame/load-error.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { ItemList } from '../../foundation/rows/item-row.js';
import { InHandRow } from './in-hand-row.js';

import type { ReactElement } from 'react';

import type { InHandPageActions } from './in-hand-page-actions.js';
import type { InHandPageData } from './in-hand-page-model.js';

function Summary({ data }: { data: InHandPageData }): ReactElement {
  const { returnable, stranded } = data.plan;
  return (
    <p className="shrink-0 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{data.items.length} in hand.</span>{' '}
      {returnable.length} can go back where they came from
      {stranded.length > 0 ? `, ${stranded.length} need a place chosen.` : '.'}
    </p>
  );
}

function Loading(): ReactElement {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading in hand">
      <Skeleton className="h-5 w-80" />
      <Skeleton className="h-60 w-full rounded-lg" />
    </div>
  );
}

function Empty(): ReactElement {
  return (
    <Card className="mx-auto mt-6 w-full max-w-lg">
      <EmptyState
        icon={INVENTORY_ICONS.inHand}
        title="Nothing in hand"
        description="Pick something up from any list or item page with P. It waits here until you put it back or move it."
        size="md"
      />
    </Card>
  );
}

/** Renders the in-hand list body and its loading, empty, and error states. */
export function InHandPageBody({
  data,
  actions,
}: {
  data: InHandPageData;
  actions: InHandPageActions;
}): ReactElement {
  if (data.body === 'loading') return <Loading />;
  if (data.body === 'error') {
    return (
      <LoadError
        title="In hand did not load"
        detail="The list request failed. Nothing was put back or moved."
        onRetry={data.itemRows.refetch}
      />
    );
  }
  if (data.items.length === 0) return <Empty />;
  return (
    <>
      <Summary data={data} />
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto">
          <ItemList
            label="In hand"
            onKeyDown={(event) => {
              if (data.selection.onKey(event)) event.preventDefault();
            }}
          >
            {data.items.map((item) => (
              <InHandRow
                key={item.id}
                item={item}
                world={data.world}
                selected={data.selection.isSelected(item.id)}
                focused={data.selection.state.focusedId === item.id}
                pending={data.pendingIds.has(item.id)}
                rejection={data.rejections.values[item.id] ?? null}
                disabledReason={data.disabledReason}
                onToggle={data.selection.onRowToggle}
                onPutBack={actions.onPutBack}
                onMove={actions.onMove}
                picker={
                  actions.pickerAnchor === 'row' &&
                  actions.picker !== null &&
                  actions.pickerIds[0] === item.id
                    ? actions.picker
                    : undefined
                }
              />
            ))}
          </ItemList>
        </div>
      </div>
    </>
  );
}
