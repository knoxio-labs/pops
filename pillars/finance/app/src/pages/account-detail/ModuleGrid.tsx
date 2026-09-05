import type { AccountKind } from '@pops/finance';

/**
 * Per-kind insight modules (loan amortisation, credit-card insights, ...)
 * are POPS-2807 — a separate ticket that should not start before POPS-2750
 * (balance checkpoints) lands, since most of those modules read a balance
 * this app cannot yet fabricate honestly. `modulesFor` is the seam POPS-2807
 * fills in: every kind returns no modules today, so this grid renders
 * nothing rather than a placeholder, matching the design reference's "a kind
 * with no modules renders the shared parts and no placeholder"
 * (`pillars/design/src/kit/account-dashboard.tsx`).
 */
export function modulesFor(_kind: AccountKind): never[] {
  return [];
}

export function ModuleGrid({ kind }: { kind: AccountKind }) {
  const modules = modulesFor(kind);
  if (modules.length === 0) return null;
  return <div className="grid gap-4 sm:grid-cols-2" />;
}
