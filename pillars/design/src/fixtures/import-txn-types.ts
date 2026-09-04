import type { StatusBadgeTone } from '@pops/ui';

/**
 * Fictional rows for the import wizard's Process/Review steps. Shaped like
 * what those screens show — a matched/uncertain/failed/skipped bucket, entity
 * resolution provenance — not like the finance contract's
 * `ProcessedTransaction`. A design fixture owes nothing to the wire format
 * and must not import one.
 */
export type EntityMatchType =
  | 'alias'
  | 'exact'
  | 'prefix'
  | 'contains'
  | 'ai'
  | 'learned'
  | 'manual';

export type TransactionType = 'purchase' | 'refund' | 'transfer' | 'income';

export interface EntityMatch {
  name: string;
  matchType: EntityMatchType;
  confidence?: number;
}

export interface RuleProvenance {
  pattern: string;
  matchType: string;
  confidence: number;
}

export interface OverriddenRule {
  ruleId: string;
  pattern: string;
  matchType: string;
  priority: number;
  confidence: number;
  entityName?: string;
}

export type ImportBucket = 'matched' | 'uncertain' | 'failed' | 'skipped';

export interface ImportTxn {
  checksum: string;
  date: string;
  description: string;
  /** Dollars, signed: negative is money out. */
  amount: number;
  account: string;
  location?: string;
  entity?: EntityMatch;
  ruleProvenance?: RuleProvenance;
  overriddenRules?: OverriddenRule[];
  transactionType?: TransactionType;
  manuallyEdited?: boolean;
  bucket: ImportBucket;
  /** Failed/skipped rows only — why the row did not reach `matched`. */
  reason?: string;
  rawRow: string;
}

export const BUCKET_TONE: Record<ImportBucket, StatusBadgeTone> = {
  matched: 'success',
  uncertain: 'warning',
  failed: 'destructive',
  skipped: 'neutral',
};

export function raw(fields: Record<string, string>): string {
  return JSON.stringify(fields, null, 2);
}
