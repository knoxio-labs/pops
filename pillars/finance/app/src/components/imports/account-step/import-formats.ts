import type { AccountOption } from '@pops/ui';

import type { BankDialectId } from '../../../store/import-store-types';

/**
 * Kinds a statement is ever exported for. Cash, gift cards and person ledgers
 * have no external source to export from, which is why they can be picked
 * here and then have nothing to offer.
 */
const IMPORTABLE_KINDS: ReadonlyArray<AccountOption['kind']> = [
  'checking',
  'savings',
  'credit-card',
  'loan',
];

/**
 * Institutions are user-authored rows (POPS-2810), not a fixed enum, so there
 * is no id to key a dialect off. The name a household typed in is the only
 * signal — matched loosely, because "ANZ" and "anz" name the same bank, and
 * every name this cannot recognise has no dialect written for it yet.
 */
const BANK_TYPE_BY_INSTITUTION_NAME: Record<string, BankDialectId> = {
  anz: 'ANZ',
  amex: 'Amex',
  'american express': 'Amex',
  ing: 'ING',
  up: 'Up',
};

/**
 * The bank dialects a picked account can plausibly hand you a statement in.
 *
 * Empty is a real answer, not a gap: an account whose kind has no statement,
 * or an institution nobody has written a parser for, has nothing to offer and
 * the step has to say so rather than falling back to every dialect POPS knows.
 */
export function bankTypesForAccount(
  account: Pick<AccountOption, 'kind' | 'institution'>
): BankDialectId[] {
  if (!IMPORTABLE_KINDS.includes(account.kind)) return [];
  const name = account.institution?.name;
  if (!name) return [];
  const bank = BANK_TYPE_BY_INSTITUTION_NAME[name.trim().toLowerCase()];
  if (!bank) return [];
  // ANZ is the only institution with a credit-card-specific dialect (the
  // headerless export with the PDF fallback) — every other kind at ANZ, and
  // every kind at every other recognised institution, reads as the bank's
  // one dialect.
  if (bank === 'ANZ' && account.kind === 'credit-card') return ['ANZ Credit Card'];
  return [bank];
}
