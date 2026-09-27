import { createContext, useContext } from 'react';

import type { ReactElement, ReactNode } from 'react';

import type { SecondColumn } from '../../foundation/items-table/table-row.js';
import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** The server-provided direct and nested content counts for container rows. */
export type ContainerContentCounts = Readonly<
  Record<string, { readonly direct: number; readonly deep: number }>
>;

/** Renders the direct contents and nested contents summary for one container. */
export function HoldsCell({
  item,
  counts,
}: {
  item: ItemRowModel;
  counts: ContainerContentCounts;
}): ReactElement {
  const count = counts[item.id] ?? { direct: 0, deep: 0 };
  if (count.direct === 0) return <span className="text-xs text-muted-foreground">Empty</span>;
  const nested = count.deep - count.direct;
  return (
    <span className="text-xs leading-4 tabular-nums">
      {count.direct} {count.direct === 1 ? 'thing' : 'things'}
      {nested > 0 ? <span className="text-muted-foreground">, {nested} nested</span> : null}
    </span>
  );
}

const contentCountsContext = createContext<ContainerContentCounts>({});

/** Supplies server-provided content counts to the table's stable Holds cell. */
export function HoldsContentCountsProvider({
  counts,
  children,
}: {
  counts: ContainerContentCounts;
  children: ReactNode;
}): ReactElement {
  return <contentCountsContext.Provider value={counts}>{children}</contentCountsContext.Provider>;
}

function HoldsTableCell({ item }: { item: ItemRowModel; world: PlacementWorld }): ReactElement {
  return <HoldsCell item={item} counts={useContext(contentCountsContext)} />;
}

/** Configures the table's Holds column with the stable server-backed cell. */
export const holdsSecondColumn: SecondColumn = {
  header: 'Holds',
  Cell: HoldsTableCell,
};
