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

/**
 * The account kind vocabulary the finance account screens share. Shaped like
 * what a screen shows, not like the finance contract: a design fixture owes
 * nothing to the wire format, and it must not import one.
 */
export type AccountKind =
  | 'checking'
  | 'savings'
  | 'credit-card'
  | 'cash'
  | 'gift-card'
  | 'person'
  | 'shared'
  | 'loan'
  | 'novated-lease'
  | 'crypto'
  | 'other';

/**
 * The sign convention a kind implies. An asset's positive balance is money
 * held; a liability's is money owed. `either` is the person ledger, where the
 * sign says which way the debt runs and neither reading is the default.
 */
export type AccountSide = 'asset' | 'liability' | 'either';

export interface AccountKindMeta {
  label: string;
  icon: LucideIcon;
  side: AccountSide;
  /** Day-one kinds carry behaviour; reserved ones are shown greyed out. */
  reserved: boolean;
  /** Whether an external balance exists to checkpoint against. */
  checkpointable: boolean;
  storedValue: boolean;
}

/**
 * The kind vocabulary — label, icon, and the three ledger behaviours the
 * discriminator drives. Every account surface reads its icon and label from
 * here, so the picker, the chip and the management list cannot disagree.
 */
export const ACCOUNT_KINDS: Record<AccountKind, AccountKindMeta> = {
  checking: {
    label: 'Checking',
    icon: Landmark,
    side: 'asset',
    reserved: false,
    checkpointable: true,
    storedValue: false,
  },
  savings: {
    label: 'Savings',
    icon: PiggyBank,
    side: 'asset',
    reserved: false,
    checkpointable: true,
    storedValue: false,
  },
  'credit-card': {
    label: 'Credit card',
    icon: CreditCard,
    side: 'liability',
    reserved: false,
    checkpointable: true,
    storedValue: false,
  },
  cash: {
    label: 'Cash',
    icon: Banknote,
    side: 'asset',
    reserved: false,
    checkpointable: false,
    storedValue: false,
  },
  'gift-card': {
    label: 'Gift card',
    icon: Gift,
    side: 'asset',
    reserved: false,
    checkpointable: false,
    storedValue: true,
  },
  person: {
    label: 'Person',
    icon: UserRound,
    side: 'either',
    reserved: false,
    checkpointable: false,
    storedValue: false,
  },
  shared: {
    label: 'Shared',
    icon: Users,
    side: 'asset',
    reserved: true,
    checkpointable: true,
    storedValue: false,
  },
  loan: {
    label: 'Loan',
    icon: HandCoins,
    side: 'liability',
    reserved: true,
    checkpointable: true,
    storedValue: false,
  },
  'novated-lease': {
    label: 'Novated lease',
    icon: Car,
    side: 'liability',
    reserved: true,
    checkpointable: true,
    storedValue: false,
  },
  crypto: {
    label: 'Crypto',
    icon: Bitcoin,
    side: 'asset',
    reserved: true,
    checkpointable: true,
    storedValue: false,
  },
  other: {
    label: 'Other',
    icon: Coins,
    side: 'asset',
    reserved: true,
    checkpointable: true,
    storedValue: false,
  },
};

/** The kinds a fresh install can choose. Order is the order they are offered. */
export const DAY_ONE_KINDS: AccountKind[] = [
  'checking',
  'savings',
  'credit-card',
  'cash',
  'gift-card',
  'person',
];

/** How a kind's sign convention reads in a sentence, for form and section copy. */
export function sideBlurb(side: AccountSide): string {
  if (side === 'liability') return 'A liability: a positive balance is money owed.';
  if (side === 'either') {
    return 'A ledger between you and a contact; the sign says which way the debt runs.';
  }
  return 'An asset: a positive balance is money held.';
}

/** The one-word noun a list section uses for a kind's side. */
export function sideNoun(side: AccountSide): string {
  if (side === 'liability') return 'owed';
  if (side === 'either') return 'ledger';
  return 'held';
}
