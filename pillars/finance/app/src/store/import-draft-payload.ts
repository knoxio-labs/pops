/**
 * The slice of the wizard store a server draft holds (finance ADR-005), and
 * the card fields derived from it on every write.
 *
 * `files` is deliberately not in it: a `File` handle is not serialisable,
 * and the file is not stored anywhere. What survives is each file's name,
 * size and modification time (`sourceFileIdentities`) — enough to recognise
 * the same file picked again after a resume and keep the work, where a
 * different file still reads as a new batch and cascades the downstream
 * reset (POPS-18). `sourceFileNames` labels the card.
 *
 * `sourceFileIdentities` is optional on the wire. Drafts never expire, and
 * one written before it existed must still resume: it hydrates over
 * `initialState`, so the field is simply empty and a re-selection resets, as
 * it always did.
 *
 * The payload crosses the wire as opaque JSON. What makes it safe to put
 * back into the store is the server's `shapeVersion`, which it stamps on
 * write and compares on read, so a payload this build cannot use never
 * reaches {@link isDraftPayload}; the guard here is the structural check
 * that turns the opaque record into the typed slice.
 */
import type { ImportStore } from './import-store-types';

export type DraftPayload = Pick<
  ImportStore,
  | 'currentStep'
  | 'sourceFileNames'
  | 'accountId'
  | 'accountName'
  | 'dialectId'
  | 'headers'
  | 'rows'
  | 'columnMap'
  | 'parsedTransactions'
  | 'parsedTransactionsFingerprint'
  | 'processSessionId'
  | 'processedForFingerprint'
  | 'processedTransactions'
  | 'confirmedTransactions'
  | 'commitResult'
  | 'pendingEntities'
  | 'pendingChangeSets'
  | 'pendingTagRuleChangeSets'
  | 'manuallyResolvedChecksums'
> &
  Partial<Pick<ImportStore, 'sourceFileIdentities'>>;

export const DRAFT_PAYLOAD_KEYS = [
  'currentStep',
  'sourceFileNames',
  'sourceFileIdentities',
  'accountId',
  'accountName',
  'dialectId',
  'headers',
  'rows',
  'columnMap',
  'parsedTransactions',
  'parsedTransactionsFingerprint',
  'processSessionId',
  'processedForFingerprint',
  'processedTransactions',
  'confirmedTransactions',
  'commitResult',
  'pendingEntities',
  'pendingChangeSets',
  'pendingTagRuleChangeSets',
  'manuallyResolvedChecksums',
] as const satisfies readonly (keyof DraftPayload)[];

export function toDraftPayload(state: ImportStore): DraftPayload {
  return {
    currentStep: state.currentStep,
    sourceFileNames: state.sourceFileNames,
    sourceFileIdentities: state.sourceFileIdentities,
    accountId: state.accountId,
    accountName: state.accountName,
    dialectId: state.dialectId,
    headers: state.headers,
    rows: state.rows,
    columnMap: state.columnMap,
    parsedTransactions: state.parsedTransactions,
    parsedTransactionsFingerprint: state.parsedTransactionsFingerprint,
    processSessionId: state.processSessionId,
    processedForFingerprint: state.processedForFingerprint,
    processedTransactions: state.processedTransactions,
    confirmedTransactions: state.confirmedTransactions,
    commitResult: state.commitResult,
    pendingEntities: state.pendingEntities,
    pendingChangeSets: state.pendingChangeSets,
    pendingTagRuleChangeSets: state.pendingTagRuleChangeSets,
    manuallyResolvedChecksums: state.manuallyResolvedChecksums,
  };
}

/** Whether any field the draft holds changed between two store snapshots. */
export function draftPayloadChanged(next: ImportStore, prev: ImportStore): boolean {
  return DRAFT_PAYLOAD_KEYS.some((key) => next[key] !== prev[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ARRAY_KEYS = [
  'sourceFileNames',
  'headers',
  'rows',
  'parsedTransactions',
  'confirmedTransactions',
  'pendingEntities',
  'pendingChangeSets',
  'pendingTagRuleChangeSets',
  'manuallyResolvedChecksums',
] as const;

const BUCKETS = ['matched', 'uncertain', 'failed', 'skipped'] as const;

function isFileIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.size === 'number' &&
    typeof value.lastModified === 'number'
  );
}

/** Structural check that a draft's JSON is the slice this build writes. */
export function isDraftPayload(value: Record<string, unknown>): value is DraftPayload {
  if (typeof value.currentStep !== 'number') return false;
  if (typeof value.accountName !== 'string' || typeof value.dialectId !== 'string') return false;
  if (value.accountId !== null && typeof value.accountId !== 'string') return false;
  if (!isRecord(value.columnMap)) return false;
  if (!ARRAY_KEYS.every((key) => Array.isArray(value[key]))) return false;
  const identities = value.sourceFileIdentities;
  if (identities !== undefined && !(Array.isArray(identities) && identities.every(isFileIdentity)))
    return false;
  const processed = value.processedTransactions;
  return isRecord(processed) && BUCKETS.every((bucket) => Array.isArray(processed[bucket]));
}

/** What the card shows: how far the run got and how much is still undecided. */
export interface DraftCounts {
  step: number;
  rowCount: number;
  unresolvedCount: number;
  span: { from: string; to: string } | null;
  processSessionId: string | null;
}

export function draftCountsOf(state: DraftPayload): DraftCounts {
  const resolved = new Set(state.manuallyResolvedChecksums);
  const { uncertain, failed } = state.processedTransactions;
  const unresolvedCount = [...uncertain, ...failed].filter((t) => !resolved.has(t.checksum)).length;
  const dates = state.parsedTransactions.map((t) => t.date).filter((d) => d.length > 0);
  const span =
    dates.length === 0
      ? null
      : {
          from: dates.reduce((a, b) => (a < b ? a : b)),
          to: dates.reduce((a, b) => (a > b ? a : b)),
        };
  return {
    step: state.currentStep,
    rowCount:
      state.parsedTransactions.length > 0 ? state.parsedTransactions.length : state.rows.length,
    unresolvedCount,
    span,
    processSessionId: state.processSessionId,
  };
}

/** The earliest point a fresh run has something worth a server record: an account and parsed rows. */
export function hasDraftWorthyState(state: ImportStore): boolean {
  return (
    state.accountId !== null &&
    state.commitResult === null &&
    (state.rows.length > 0 || state.parsedTransactions.length > 0)
  );
}

function hasCurrentProcessedResults(state: DraftPayload): boolean {
  const { matched, uncertain, failed, skipped } = state.processedTransactions;
  return (
    matched.length + uncertain.length + failed.length + skipped.length > 0 &&
    state.processedForFingerprint !== null &&
    state.processedForFingerprint === state.parsedTransactionsFingerprint
  );
}

/**
 * The step a resumed draft can actually stand on. A draft saved at Tags
 * whose processed results are gone lands on Process, not Tags, because
 * every later step reads state that only Process produces.
 */
export function clampResumeStep(state: DraftPayload): number {
  let cap = 1;
  if (state.confirmedTransactions.length > 0) cap = 7;
  else if (hasCurrentProcessedResults(state)) cap = 4;
  else if (state.parsedTransactions.length > 0) cap = 3;
  else if (state.rows.length > 0 && state.headers.length > 0) cap = 2;
  return Math.min(state.currentStep, cap);
}
