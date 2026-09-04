import { type AccountKind } from '@/fixtures/account-kinds';
import { type Account, activeAccounts } from '@/fixtures/accounts';

import type { RadioOption } from '@pops/ui';

/**
 * The file shapes POPS can parse. A format belongs to an institution's export
 * screen, not to a bank: ANZ hands out two files from the same page and they
 * are read by different parsers.
 */
export interface ImportFormat {
  id: string;
  label: string;
  /** Where the file comes from, in the words the bank's own site uses. */
  description: string;
  extensions: string;
}

export const FORMATS: Record<string, ImportFormat> = {
  'anz-csv': {
    id: 'anz-csv',
    label: 'ANZ transaction CSV',
    description: 'Internet Banking → Export → CSV. Four columns, no header row.',
    extensions: '.csv',
  },
  'anz-ofx': {
    id: 'anz-ofx',
    label: 'ANZ OFX',
    description: 'The Quicken/Money export from the same page. Carries the bank’s own ids.',
    extensions: '.ofx, .qfx',
  },
  'amex-csv': {
    id: 'amex-csv',
    label: 'Amex activity CSV',
    description: 'Statements & Activity → Download → CSV with headers.',
    extensions: '.csv',
  },
  'amex-ofx': {
    id: 'amex-ofx',
    label: 'Amex OFX',
    description: 'Same screen, “Quicken (QFX)”. Pending charges are left out.',
    extensions: '.ofx, .qfx',
  },
  'ing-csv': {
    id: 'ing-csv',
    label: 'ING transaction CSV',
    description: 'Everyday Balance → Export. One row per transaction.',
    extensions: '.csv',
  },
  'generic-csv': {
    id: 'generic-csv',
    label: 'Generic CSV',
    description: 'Any CSV. You map the columns after upload, and the mapping is remembered.',
    extensions: '.csv',
  },
};

const BY_INSTITUTION: Record<string, string[]> = {
  anz: ['anz-csv', 'anz-ofx'],
  amex: ['amex-csv', 'amex-ofx'],
  ing: ['ing-csv'],
};

/**
 * Kinds a statement is ever exported for. Cash, gift cards and person ledgers
 * have no external source to export from, which is why they can be selected
 * here and then offer nothing.
 */
const IMPORTABLE_KINDS: AccountKind[] = ['checking', 'savings', 'credit-card', 'loan'];

/**
 * The formats offered for one account. Empty is a real answer, not a gap: an
 * account whose kind has no statement, or an institution nobody has written a
 * parser for, has nothing to offer and the step has to say so.
 */
export function formatsForAccount(account: Account): ImportFormat[] {
  if (!IMPORTABLE_KINDS.includes(account.kind)) return [];
  const branded = account.institutionId ? (BY_INSTITUTION[account.institutionId] ?? []) : [];
  return [...branded, 'generic-csv'].map((id) => FORMATS[id]).filter((f) => f !== undefined);
}

export function radioOptions(formats: ImportFormat[]): RadioOption[] {
  return formats.map((format) => ({
    value: format.id,
    label: format.label,
    description: `${format.description} (${format.extensions})`,
  }));
}

/** Every account the picker offers — including the ones that import nothing. */
export const importableAccounts = activeAccounts;

export function accountById(id: string): Account {
  const found = importableAccounts.find((a) => a.id === id);
  if (!found) throw new Error(`no fixture account ${id}`);
  return found;
}

/** The choice carried from the first step into every step after it. */
export interface ImportChoice {
  account: Account;
  format: ImportFormat;
}

export function choiceOf(accountId: string, formatId: string): ImportChoice {
  const format = FORMATS[formatId];
  if (!format) throw new Error(`no fixture format ${formatId}`);
  return { account: accountById(accountId), format };
}
