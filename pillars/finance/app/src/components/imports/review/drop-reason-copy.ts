import type { DropReason } from './buildConfirmed';

/**
 * How each {@link DropReason} is worded, in the two places the user meets it:
 * `label` on the blocked row itself, `remedy` in the notice that counts them.
 * Shared so a row can never describe its block differently from the banner
 * pointing at it (POPS-3659).
 */
export const dropReasonCopy: Record<DropReason, { label: string; remedy: string }> = {
  entity: {
    label: 'needs a merchant',
    remedy: 'assign a merchant entity, or change the type to a non-merchant one',
  },
  type: {
    label: 'needs a transaction type',
    remedy:
      'set a transaction type on the money coming in — a credit is never assumed to be an expense',
  },
};
