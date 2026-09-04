import {
  Banknote,
  Bitcoin,
  Car,
  Coins,
  CreditCard,
  Gift,
  HandCoins,
  Landmark,
  PiggyBank,
  UserRound,
  Users,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

import type { AccountKind } from './types';

/**
 * Label and icon per account kind. Kept here rather than on `@pops/finance`'s
 * `ACCOUNT_KINDS` — that enum owns the wire value and ledger behaviour, not
 * how a kind is drawn. Mirrors the member list in
 * `pillars/finance/src/contract/account-kind.ts`; a kind added there needs an
 * entry added here too.
 */
export const ACCOUNT_KIND_META: Record<AccountKind, { label: string; icon: LucideIcon }> = {
  checking: { label: 'Checking', icon: Landmark },
  savings: { label: 'Savings', icon: PiggyBank },
  'credit-card': { label: 'Credit card', icon: CreditCard },
  cash: { label: 'Cash', icon: Banknote },
  'gift-card': { label: 'Gift card', icon: Gift },
  person: { label: 'Person', icon: UserRound },
  shared: { label: 'Shared', icon: Users },
  loan: { label: 'Loan', icon: HandCoins },
  'novated-lease': { label: 'Novated lease', icon: Car },
  crypto: { label: 'Crypto', icon: Bitcoin },
  other: { label: 'Other', icon: Coins },
};
