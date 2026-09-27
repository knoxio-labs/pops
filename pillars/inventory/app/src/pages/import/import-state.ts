import {
  BLANK_DRAFT,
  type BulkColumn,
  type BulkDraft,
} from '../../foundation/list-page/paste-parser.js';

import type { BatchProgress } from '../../inventory-web/batch-commit.js';
import type { BatchCreate, BatchRowOutcome, BatchRun } from '../../inventory-web/useBatchCreate.js';
import type { DeleteCreatedResult } from '../../inventory-web/useDeleteCreated.js';
import type { ColumnMapping, ColumnTarget, MappingProblem } from './import-model.js';

/** The visible phases of the import workflow. */
export type ImportPhase = 'upload' | 'mapping' | 'preview' | 'committing' | 'done';

/** One server problem attached to an imported row. A null column means no cell is at fault. */
export interface ImportIssue {
  column: BulkColumn | null;
  message: string;
}

/** A parsed row together with its latest dry-run or commit outcome. */
export interface ImportRowResult {
  /** The zero-based index in the parsed data rows. */
  row: number;
  cells: readonly string[];
  draft: BulkDraft;
  status: 'ready' | 'skipped' | 'blank' | 'created';
  issues: readonly ImportIssue[];
}

/** State and actions owned by the CSV import page. */
export interface ImportState {
  phase: ImportPhase;
  file: { name: string; rowCount: number } | null;
  /** The complete refusal sentence for the last rejected file, or null. */
  refused: string | null;
  headers: string[];
  /** Parsed data rows from the loaded file. */
  rows: readonly (readonly string[])[];
  mapping: ColumnMapping[];
  /** Header-target pairs from the first automatic mapping guess. */
  guessed: ReadonlySet<string>;
  problems: MappingProblem[];
  results: ImportRowResult[];
  onlyProblems: boolean;
  ready: number;
  skipped: number;
  imported: number;
  /** Null until the first commit slice reports progress. */
  progress: BatchProgress | null;
  createdIds: readonly string[];
  load: (file: File) => Promise<void>;
  setTarget: (header: string, target: ColumnTarget) => void;
  setOnlyProblems: (on: boolean) => void;
  check: () => Promise<void>;
  commit: () => Promise<void>;
  back: () => void;
  undo: () => Promise<DeleteCreatedResult>;
  downloadSkipped: () => void;
  reset: () => void;
}

/** The mutable data held by the import hook before its actions are attached. */
export interface ImportData {
  phase: ImportPhase;
  file: { name: string; rowCount: number } | null;
  refused: string | null;
  headers: string[];
  rows: readonly (readonly string[])[];
  mapping: ColumnMapping[];
  guessed: ReadonlySet<string>;
  problems: MappingProblem[];
  results: ImportRowResult[];
  onlyProblems: boolean;
  ready: number;
  skipped: number;
  imported: number;
  progress: BatchProgress | null;
  createdIds: readonly string[];
}

/** Returns the initial upload state for a new or reset import. */
export function initialImportData(): ImportData {
  return {
    phase: 'upload',
    file: null,
    refused: null,
    headers: [],
    rows: [],
    mapping: [],
    guessed: new Set<string>(),
    problems: [],
    results: [],
    onlyProblems: false,
    ready: 0,
    skipped: 0,
    imported: 0,
    progress: null,
    createdIds: [],
  };
}

function issuesForOutcome(outcome: BatchRowOutcome): ImportIssue[] {
  if (outcome.status === 'invalid') {
    return outcome.issues.map((issue) => ({ column: issue.column, message: issue.message }));
  }
  if (outcome.status === 'not-sent') return [{ column: null, message: outcome.error.message }];
  return [];
}

function resultStatus(outcome: BatchRowOutcome): ImportRowResult['status'] {
  if (outcome.status === 'valid') return 'ready';
  if (outcome.status === 'created') return 'created';
  if (outcome.status === 'blank') return 'blank';
  return 'skipped';
}

/** Pairs every parsed row with the outcome returned for its global row index. */
export function resultsFromRun(
  rows: readonly (readonly string[])[],
  drafts: readonly BulkDraft[],
  run: BatchRun
): ImportRowResult[] {
  const outcomes = new Map(run.outcomes.map((outcome) => [outcome.row, outcome]));
  return rows.map((cells, row) => {
    const outcome = outcomes.get(row);
    if (outcome === undefined) {
      return {
        row,
        cells,
        draft: drafts[row] ?? BLANK_DRAFT,
        status: 'skipped',
        issues: [{ column: null, message: 'The inventory service did not return a result.' }],
      };
    }
    return {
      row,
      cells,
      draft: drafts[row] ?? BLANK_DRAFT,
      status: resultStatus(outcome),
      issues: issuesForOutcome(outcome),
    };
  });
}

/** Counts rows that are ready to import and rows that will be skipped. */
export function importCounts(results: readonly ImportRowResult[]): {
  ready: number;
  skipped: number;
} {
  return {
    ready: results.filter((result) => result.status === 'ready').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  };
}

/** Converts immutable drafts into the request rows accepted by the batch hook. */
export function batchRows(drafts: readonly BulkDraft[]): Parameters<BatchCreate['validate']>[0] {
  return drafts.map((draft) => ({ ...draft }));
}

/** Returns the header-target pairs produced by the first automatic mapping guess. */
export function guessedPairs(
  headers: readonly string[],
  guess: (headers: readonly string[]) => readonly ColumnMapping[]
): Set<string> {
  return new Set(
    guess(headers)
      .filter((column) => column.target !== 'skip')
      .map((column) => `${column.header}:${column.target}`)
  );
}
