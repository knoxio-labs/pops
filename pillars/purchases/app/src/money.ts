import { formatCurrency } from '@pops/ui';

/**
 * Render a minor-unit amount in its own currency.
 *
 * The currency arrives as free text from whatever source document produced the
 * order, and `Intl.NumberFormat` throws a `RangeError` on a code it does not
 * recognise. A whole view that fails to render because one order carried a
 * typo'd code is a worse outcome than one row showing a bare number, so an
 * unknown code degrades instead of propagating.
 */
export function formatCents(cents: number, currency: string): string {
  try {
    return formatCurrency(cents / 100, {
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
