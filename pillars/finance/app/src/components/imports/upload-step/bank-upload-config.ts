import type { BankDialectId } from '../../../store/import-store-types';

/**
 * File types each bank's import takes.
 *
 * Only the credit card has a PDF reader behind it: ANZ's CSV export reaches
 * back two years and the PDF statements are how anything older is recovered.
 * Offering PDF anywhere else would show a picker for a path that does not
 * exist.
 */
export const BANK_ACCEPTED_TYPES: Record<BankDialectId, string> = {
  ANZ: '.csv',
  'ANZ Credit Card': '.csv,.pdf',
  Amex: '.csv',
  ING: '.csv',
  Up: '.csv',
};

export const BANK_OPTIONS = [
  { value: 'ANZ', label: 'ANZ', description: 'Everyday, Savings' },
  { value: 'ANZ Credit Card', label: 'ANZ Credit Card', description: 'Frequent Flyer, Rewards' },
  { value: 'Amex', label: 'Amex', description: 'American Express' },
  { value: 'ING', label: 'ING', description: 'Savings, Everyday' },
  { value: 'Up', label: 'Up', description: 'Everyday, Round Up' },
] satisfies Array<{ value: BankDialectId; label: string; description: string }>;

export const BANK_HELP: Record<BankDialectId, string> = {
  ANZ: 'Log in to ANZ Internet Banking, open your account, and export transactions as CSV.',
  'ANZ Credit Card':
    'Log in to ANZ Internet Banking, open your credit card, and export transactions as CSV. The export has no header row — that is expected.',
  Amex: 'Log in to your Amex online portal and download your transactions as a CSV export.',
  ING: 'Log in to ING Banking Online, open your account, and export transactions as CSV.',
  Up: 'In the Up app, go to your account, tap Export, and choose CSV format.',
};

/** Whether this bank's import will read a PDF statement as well as a CSV export. */
export function bankTakesPdf(dialectId: BankDialectId): boolean {
  return BANK_ACCEPTED_TYPES[dialectId].includes('.pdf');
}
