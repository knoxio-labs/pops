import type { ColumnId } from './column-widths';

/**
 * Column widths the item table's header and rows share, so they cannot
 * drift apart. `base` is the default layout; `sized` takes over once the
 * header's grip has given the column a width. The Updated date drops below
 * 1024px (spec 3.10); name, type, place, code and the row's verbs stay.
 */
export const COLUMN: Readonly<Record<ColumnId, { base: string; sized: string }>> = {
  name: { base: 'min-w-40 flex-1', sized: 'w-(--col-name) shrink-0' },
  type: {
    base: 'w-24 shrink-0 truncate lg:w-28',
    sized: 'w-(--col-type) shrink-0 truncate',
  },
  where: { base: 'w-44 shrink-0 lg:w-64', sized: 'w-(--col-where) shrink-0' },
  code: {
    base: 'w-20 shrink-0 overflow-hidden whitespace-nowrap',
    sized: 'w-(--col-code) shrink-0 overflow-hidden whitespace-nowrap',
  },
  /** Updated, with the row's verbs drawn over it on hover and keyboard focus. */
  updated: {
    base: 'relative w-28 shrink-0 self-stretch',
    sized: 'relative w-(--col-updated) shrink-0 self-stretch',
  },
};
