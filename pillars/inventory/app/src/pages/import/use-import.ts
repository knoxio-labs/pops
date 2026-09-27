import { useCallback, useState } from 'react';

import { downloadCsv } from '../../foundation/list-page/inventory-csv.js';
import { commitWithProgress } from '../../inventory-web/batch-commit.js';
import { useBatchCreate, type BatchCreate } from '../../inventory-web/useBatchCreate.js';
import { useDeleteCreated } from '../../inventory-web/useDeleteCreated.js';
import {
  applyMapping,
  fileRefusal,
  guessMapping,
  mappingProblems,
  readCsv,
  skippedCsv,
} from './import-model.js';
import {
  batchRows,
  guessedPairs,
  importCounts,
  initialImportData,
  resultsFromRun,
} from './import-state.js';

import type { Dispatch, SetStateAction } from 'react';

import type { ColumnTarget } from './import-model.js';
import type { ImportData, ImportState } from './import-state.js';

export type { ImportIssue, ImportPhase, ImportRowResult, ImportState } from './import-state.js';

type SetImportData = Dispatch<SetStateAction<ImportData>>;

async function loadImport(file: File, setData: SetImportData): Promise<void> {
  const parsed = readCsv(await file.text());
  const refusal = fileRefusal(file.name, parsed);
  if (refusal !== null) {
    setData({ ...initialImportData(), refused: refusal });
    return;
  }

  const mapping = guessMapping(parsed.headers);
  setData({
    ...initialImportData(),
    phase: 'mapping',
    file: { name: file.name, rowCount: parsed.rows.length },
    headers: parsed.headers,
    rows: parsed.rows,
    mapping,
    guessed: guessedPairs(parsed.headers, guessMapping),
    problems: mappingProblems(mapping),
  });
}

function changeTarget(setData: SetImportData, header: string, target: ColumnTarget): void {
  setData((current) => {
    let changed = false;
    const mapping = current.mapping.map((column) => {
      if (changed || column.header !== header) return column;
      changed = true;
      return { ...column, target };
    });
    return { ...current, mapping, problems: mappingProblems(mapping) };
  });
}

async function checkImport(
  data: ImportData,
  validate: BatchCreate['validate'],
  setData: SetImportData
): Promise<void> {
  const drafts = applyMapping(data.rows, data.mapping);
  const run = await validate(batchRows(drafts));
  const results = resultsFromRun(data.rows, drafts, run);
  const counts = importCounts(results);
  setData((current) => ({
    ...current,
    phase: 'preview',
    results,
    ready: counts.ready,
    skipped: counts.skipped,
    imported: 0,
    progress: null,
  }));
}

async function commitImport(
  data: ImportData,
  create: BatchCreate['commit'],
  setData: SetImportData
): Promise<void> {
  const drafts = applyMapping(data.rows, data.mapping);
  setData((current) => ({ ...current, phase: 'committing', progress: null }));
  const run = await commitWithProgress(create, batchRows(drafts), undefined, (progress) =>
    setData((current) => ({ ...current, progress }))
  );
  const results = resultsFromRun(data.rows, drafts, run);
  const counts = importCounts(results);
  const createdIds = run.outcomes.flatMap((outcome) =>
    outcome.status === 'created' ? [outcome.itemId] : []
  );
  setData((current) => ({
    ...current,
    phase: 'done',
    results,
    ready: counts.ready,
    skipped: counts.skipped,
    imported: createdIds.length,
    createdIds,
  }));
}

function goBack(setData: SetImportData): void {
  setData((current) => {
    if (current.phase === 'preview') return { ...current, phase: 'mapping' };
    if (current.phase === 'mapping') return { ...current, phase: 'upload' };
    return current;
  });
}

async function undoImport(
  ids: readonly string[],
  deleteCreated: ReturnType<typeof useDeleteCreated>,
  setData: SetImportData
) {
  const result = await deleteCreated(ids);
  setData(initialImportData());
  return result;
}

function downloadSkippedRows(data: ImportData): void {
  if (data.file === null) return;
  const skipped = data.results.filter((result) => result.status === 'skipped');
  const problems = skipped.map((result) => result.issues.map((issue) => issue.message).join(' '));
  const rows = skipped.map((result) => result.cells);
  const baseName = data.file.name.replace(/\.csv$/iu, '');
  downloadCsv(`${baseName}-skipped.csv`, skippedCsv(data.headers, rows, problems));
}

/** Owns CSV parsing, mapping, server validation, partial commit, and undo state. */
export function useImport(): ImportState {
  const [data, setData] = useState<ImportData>(initialImportData);
  const { validate, commit: create } = useBatchCreate();
  const deleteCreated = useDeleteCreated();

  const load = useCallback((file: File) => loadImport(file, setData), []);
  const setTarget = useCallback(
    (header: string, target: ColumnTarget) => changeTarget(setData, header, target),
    []
  );
  const setOnlyProblems = useCallback(
    (on: boolean): void => setData((current) => ({ ...current, onlyProblems: on })),
    []
  );
  const check = useCallback(() => checkImport(data, validate, setData), [data, validate]);
  const commit = useCallback(() => commitImport(data, create, setData), [create, data]);
  const back = useCallback((): void => goBack(setData), []);
  const undo = useCallback(
    () => undoImport(data.createdIds, deleteCreated, setData),
    [data.createdIds, deleteCreated]
  );
  const downloadSkipped = useCallback((): void => downloadSkippedRows(data), [data]);
  const reset = useCallback((): void => setData(initialImportData()), []);

  return {
    ...data,
    load,
    setTarget,
    setOnlyProblems,
    check,
    commit,
    back,
    undo,
    downloadSkipped,
    reset,
  };
}
