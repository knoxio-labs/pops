import type {
  ChangeSet,
  CommitResult,
  ConfirmedTransaction,
  ImportWarning,
  ParsedTransaction,
  ProcessedTransaction as BaseProcessedTransaction,
  TagRuleChangeSet,
} from '@pops/finance';

export type BankType = 'ANZ' | 'ANZ Credit Card' | 'Amex' | 'ING' | 'Up';
export type { ChangeSet };
export type EntityType = 'company' | 'person' | 'government' | 'bank';

export interface PendingEntity {
  tempId: string;
  name: string;
  type: EntityType;
}

export interface AddPendingEntityInput {
  name: string;
  type: EntityType;
}

export interface PendingChangeSet {
  tempId: string;
  changeSet: ChangeSet;
  appliedAt: string;
  source: string;
}

export interface AddPendingChangeSetInput {
  changeSet: ChangeSet;
  source: string;
}

export interface PendingTagRuleChangeSet {
  tempId: string;
  changeSet: TagRuleChangeSet;
  appliedAt: string;
  source: string;
  /**
   * New-vocabulary tags the user accepted in the tag-rule dialog. Only those
   * are upserted into the vocabulary at commit, so a tag the user unchecked
   * never lands. Absent for flows with no accept/decline step (batch rule
   * creation), where every tag the ChangeSet carries is upserted.
   */
  acceptedNewTags?: string[];
}

export interface AddPendingTagRuleChangeSetInput {
  changeSet: TagRuleChangeSet;
  source: string;
  acceptedNewTags?: string[];
}

export interface ProcessedTransaction extends BaseProcessedTransaction {
  manuallyEdited?: boolean;
}

export interface ImportStore {
  currentStep: number;
  files: File[];
  sourceFileNames: string[];
  /** The real account transactions land in — `null` until picked in the Upload step's account field. */
  accountId: string | null;
  /** Kept alongside `accountId` so the picked account survives a persisted-state reload without a refetch. */
  accountName: string;
  bankType: BankType;
  headers: string[];
  rows: Record<string, string>[];
  columnMap: {
    date: string;
    description: string;
    amount: string;
    location?: string;
  };
  parsedTransactions: ParsedTransaction[];
  parsedTransactionsFingerprint: string;
  processSessionId: string | null;
  processedForFingerprint: string | null;
  processedTransactions: {
    matched: ProcessedTransaction[];
    uncertain: ProcessedTransaction[];
    failed: ProcessedTransaction[];
    skipped: ProcessedTransaction[];
    warnings?: ImportWarning[];
  };
  confirmedTransactions: ConfirmedTransaction[];
  commitResult: CommitResult | null;
  pendingEntities: PendingEntity[];
  pendingChangeSets: PendingChangeSet[];
  pendingTagRuleChangeSets: PendingTagRuleChangeSet[];
  manuallyResolvedChecksums: string[];

  setFiles: (files: File[]) => void;
  setAccount: (accountId: string, accountName: string) => void;
  setBankType: (bankType: BankType) => void;
  setHeaders: (headers: string[]) => void;
  setRows: (rows: Record<string, string>[]) => void;
  setColumnMap: (columnMap: ImportStore['columnMap']) => void;
  setParsedTransactions: (parsed: ParsedTransaction[]) => void;
  setProcessSessionId: (sessionId: string | null) => void;
  setProcessedTransactions: (processed: ImportStore['processedTransactions']) => void;
  setConfirmedTransactions: (confirmed: ConfirmedTransaction[]) => void;
  setCommitResult: (result: CommitResult | null) => void;

  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  reset: () => void;

  addPendingEntity: (
    input: AddPendingEntityInput,
    dbEntities?: Array<{ name: string }>
  ) => PendingEntity;
  listPendingEntities: () => PendingEntity[];
  removePendingEntity: (tempId: string) => void;

  addPendingChangeSet: (input: AddPendingChangeSetInput) => PendingChangeSet;
  listPendingChangeSets: () => PendingChangeSet[];
  removePendingChangeSet: (tempId: string) => void;

  addPendingTagRuleChangeSet: (input: AddPendingTagRuleChangeSetInput) => PendingTagRuleChangeSet;
  listPendingTagRuleChangeSets: () => PendingTagRuleChangeSet[];
  removePendingTagRuleChangeSet: (tempId: string) => void;

  findSimilar: (transaction: ProcessedTransaction) => ProcessedTransaction[];

  updateTransactionTags: (checksum: string, tags: string[]) => void;

  markChecksumsResolved: (checksums: string[]) => void;
}

export const initialState = {
  currentStep: 1,
  files: [],
  sourceFileNames: [],
  accountId: null,
  accountName: '',
  bankType: 'Amex' as BankType,
  headers: [],
  rows: [],
  columnMap: { date: '', description: '', amount: '' },
  parsedTransactions: [],
  parsedTransactionsFingerprint: '',
  processSessionId: null,
  processedForFingerprint: null,
  processedTransactions: {
    matched: [],
    uncertain: [],
    failed: [],
    skipped: [],
    warnings: undefined,
  },
  confirmedTransactions: [],
  commitResult: null,
  pendingEntities: [],
  pendingChangeSets: [],
  pendingTagRuleChangeSets: [],
  manuallyResolvedChecksums: [],
};

/**
 * Produce a content fingerprint for a list of parsed transactions.
 */
export function fingerprintParsedTransactions(txns: ParsedTransaction[]): string {
  if (txns.length === 0) return '';
  return txns.map((t) => t.checksum).join('|');
}

export const downstreamReset: Pick<
  ImportStore,
  | 'headers'
  | 'rows'
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
> = {
  headers: initialState.headers,
  rows: initialState.rows,
  parsedTransactions: initialState.parsedTransactions,
  parsedTransactionsFingerprint: initialState.parsedTransactionsFingerprint,
  processSessionId: initialState.processSessionId,
  processedForFingerprint: initialState.processedForFingerprint,
  processedTransactions: initialState.processedTransactions,
  confirmedTransactions: initialState.confirmedTransactions,
  commitResult: initialState.commitResult,
  pendingEntities: initialState.pendingEntities,
  pendingChangeSets: initialState.pendingChangeSets,
  pendingTagRuleChangeSets: initialState.pendingTagRuleChangeSets,
  manuallyResolvedChecksums: initialState.manuallyResolvedChecksums,
};

export function isSameFile(a: File | null, b: File | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Positional comparison — reordering a batch reorders the merged rows, which is
 * a genuinely different parse, so it must cascade the downstream reset too.
 */
export function isSameFileSet(a: File[], b: File[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((file, i) => isSameFile(file, b[i] ?? null));
}
