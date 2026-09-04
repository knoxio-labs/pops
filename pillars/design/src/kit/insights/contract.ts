import type { AccountInsight } from '@/fixtures/account-insights';
import type { AccountKind } from '@/fixtures/account-kinds';
import type { Account } from '@/fixtures/accounts';
import type { ComponentType } from 'react';

/**
 * One card on an account's dashboard. A module is per-kind: it may assume the
 * parts of `AccountInsight` its kind is guaranteed to carry, and it renders
 * nothing rather than a placeholder when the account it is given has no data
 * for it.
 */
export interface InsightModule {
  id: string;
  title: string;
  /** Columns taken in the dashboard's grid. Default 1. */
  span?: 1 | 2;
  Body: ComponentType<{ account: Account; insight: AccountInsight }>;
}

export type InsightModules = Partial<Record<AccountKind, InsightModule[]>>;
