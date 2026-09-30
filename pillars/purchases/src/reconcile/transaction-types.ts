import type { SettlementRole } from '../contract/constants.js';

const SETTLEMENT_TRANSACTION_TYPES: Readonly<Record<SettlementRole, ReadonlySet<string>>> = {
  capture: new Set(['purchase']),
  authorization: new Set(['purchase']),
  refund: new Set(['refund', 'reversal']),
  adjustment: new Set(['purchase']),
};

/**
 * Return whether a Finance transaction type can settle a charge with this
 * role. Unknown Finance type strings are rejected.
 */
export function isTransactionTypeAllowedForRole(
  role: SettlementRole,
  transactionType: string
): boolean {
  return SETTLEMENT_TRANSACTION_TYPES[role].has(transactionType);
}
