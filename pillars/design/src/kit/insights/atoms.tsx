import { cn } from '@pops/ui';

/**
 * A labelled figure inside a dashboard module. `tone` is the sign colour from
 * `ledger-tone` and is passed only for figures that are ledger-signed — a
 * magnitude such as an amount owed or a month's interest is left untoned, so
 * that a green number always means money that can be spent.
 */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone)}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** What a module says instead of a placeholder when the account has no data for it. */
export function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
