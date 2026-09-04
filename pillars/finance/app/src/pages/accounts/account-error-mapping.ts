import { type UseFormReturn } from 'react-hook-form';

import { FinanceApiError } from '../../finance-api-helpers.js';

import type { AccountFormValues } from './types';

/**
 * Maps an `accountsCreate`/`accountsUpdate` failure onto the form field it
 * concerns. There is no existing convention for this in this app to follow
 * (`EntityFormDialog` never sets a field error from the API; it toasts the
 * message and leaves the dialog open) — no prior finance-app form maps a
 * 409/422 to a specific field. This is a new, minimal convention: every
 * server error that can reach here collapses to the SAME generic `code`
 * (`ConflictError` for all three 409s, `UnprocessableEntityError` for all
 * three 422s — see `accounts-handlers.ts`'s `translateAccountError`, which
 * passes no per-error `messageKey`), so the only signal left to route on is
 * the error's own `message` text. Returns `true` when the error was mapped
 * to a field; the caller falls back to a toast otherwise.
 */
export function mapAccountApiError(err: unknown, form: UseFormReturn<AccountFormValues>): boolean {
  if (!(err instanceof FinanceApiError)) return false;
  const message = err.message;

  if (err.status === 409 && /^Account '.+' already exists$/.test(message)) {
    form.setError('name', { message });
    return true;
  }
  if (err.status === 409 && /cash account in currency/.test(message)) {
    form.setError('currency', { message });
    return true;
  }
  if (err.status === 422 && /is reserved and has no behaviour/.test(message)) {
    form.setError('kind', { message });
    return true;
  }
  if (err.status === 422 && /requires an entityId/.test(message)) {
    form.setError('name', {
      message: 'Enter a name we can look up or create a matching contact for.',
    });
    return true;
  }
  return false;
}
