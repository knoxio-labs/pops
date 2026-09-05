import { getAccountKindBehaviour } from '@pops/finance';
import { Card, CardContent } from '@pops/ui';

import type { Account } from '../accounts/types';

/**
 * What is true about this kind's balance today, with no number attached.
 * `hasExternalBalance` and `isStoredValue` are the same fields POPS-2750 will
 * checkpoint against — this text names the reason there is nothing here yet
 * without guessing at when that lands.
 */
function provenanceLine(account: Account): string {
  const behaviour = getAccountKindBehaviour(account.kind);
  if (behaviour.isStoredValue) {
    return "Balance tracking isn't wired up yet — this will track the stored value directly (POPS-2750).";
  }
  if (behaviour.hasExternalBalance) {
    return "Balance tracking isn't wired up yet — this will check against your statements (POPS-2750).";
  }
  return 'No external balance to check against; a future balance here would be derived from transactions (POPS-2750).';
}

/**
 * The balance card, honestly empty. The real `accounts` wire schema carries
 * no balance field (POPS-2750 is still Backlog) — summing this account's
 * transactions would give net flow, not balance, and a confidently wrong
 * number is worse than none, so this renders no figure and no trend rather
 * than fabricate either client-side. Once POPS-2750 ships a checkpoint, this
 * is where the signed headline number and its 12-month trend land — see the
 * design reference (`pillars/design/src/kit/account-dashboard.tsx`).
 */
export function BalanceCard({ account }: { account: Account }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Balance</p>
        <p className="text-2xl font-semibold text-muted-foreground">Not tracked yet</p>
        <p className="text-xs text-muted-foreground">{provenanceLine(account)}</p>
      </CardContent>
    </Card>
  );
}
