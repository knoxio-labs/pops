import { cn } from '../lib/utils';

/**
 * A ledger amount shown with its direction: `-$42.50` in the destructive
 * colour for money out, `+$139.72` in the success colour for money in.
 *
 * The sign is taken from the amount rounded to cents, so a float residue
 * such as a group total of `-1e-13` renders as `+$0.00`, never `-$0.00`.
 */
export function SignedAmount({ amount, className }: { amount: number; className?: string }) {
  const cents = Math.round(amount * 100);
  const isNegative = cents < 0;
  return (
    <span className={cn(isNegative ? 'text-destructive' : 'text-success', className)}>
      {isNegative ? '-' : '+'}${(Math.abs(cents) / 100).toFixed(2)}
    </span>
  );
}
