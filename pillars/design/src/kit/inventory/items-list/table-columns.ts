/**
 * Column widths the item table's header and rows share, so they cannot
 * drift apart. The Updated date drops below 1024px (spec 3.10); name, type,
 * place, code and the row's verbs stay.
 */
export const COLUMN = {
  type: 'w-24 shrink-0 truncate lg:w-28',
  where: 'w-44 shrink-0 lg:w-64',
  code: 'w-20 shrink-0 whitespace-nowrap',
  /** Updated, with the row's verbs drawn over it on hover and keyboard focus. */
  trail: 'relative w-28 shrink-0 self-stretch',
} as const;
