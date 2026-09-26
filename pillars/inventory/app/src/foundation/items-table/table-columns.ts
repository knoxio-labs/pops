import type { ColumnId } from './column-widths';

/** The default and explicitly-sized classes shared by each table column. */
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
  updated: {
    base: 'relative w-28 shrink-0 self-stretch',
    sized: 'relative w-(--col-updated) shrink-0 self-stretch',
  },
};
