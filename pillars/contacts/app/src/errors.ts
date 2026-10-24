import enAU from './locales/en-AU.json';

import type { TFunction } from 'i18next';

/** A safe translated failure category, separate from its copyable diagnostic code. */
export type ContactErrorMessage = keyof typeof enAU.errors;

/** Retain stable diagnostics and an English debugging message without embedding API response bodies. */
export class ContactError extends Error {
  override readonly name: string = 'ContactError';
  constructor(
    readonly messageKey: ContactErrorMessage,
    readonly diagnostic: string
  ) {
    super(`${enAU.errors[messageKey]} [${diagnostic}]`);
  }
}

/** Translate known failures at render time so changing the shell language also changes error text. */
export function describeContactError(error: Error, t: TFunction<'contacts'>): string {
  return error instanceof ContactError
    ? `${t(`errors.${error.messageKey}`)} [${error.diagnostic}]`
    : error.message;
}
