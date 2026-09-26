/**
 * `/inventory/import`: a CSV in, its columns matched to item fields, every
 * row checked, then imported. Rows with problems are skipped, not fatal,
 * and come back as a CSV to fix and import again, the same partial accept
 * as bulk entry.
 */
import { FileSpreadsheet, FileUp } from 'lucide-react';

import { Button, Progress, Switch, Label } from '@pops/ui';

import { validateRows } from '../bulk-entry/row-validation';
import { InventoryPage } from '../shared/page-frame';
import { ImportDone } from './import-done';
import { applyMapping, guessMapping, mappingProblems } from './import-model';
import { ImportSteps } from './import-steps';
import { MappingStep } from './mapping-step';
import { PreviewStep } from './preview-step';
import { UploadStep } from './upload-step';

import type { BulkContext } from '../bulk-entry/row-validation';
import type { TypeTreeRecord } from '../type-tree/model';
import type { ColumnMapping } from './import-model';

/** Where the import is. */
export type ImportPhase = 'upload' | 'mapping' | 'preview' | 'committing' | 'done';

/** Props for {@link ImportPage}. */
export interface ImportPageProps {
  phase: ImportPhase;
  file: { name: string; rowCount: number };
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  mapping: readonly ColumnMapping[];
  context: BulkContext;
  onlyProblems?: boolean;
  refused?: string;
  typeTreePreview?: boolean;
}

function FileLine({ file }: Pick<ImportPageProps, 'file'>) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">{file.name}</span>
      <span className="text-muted-foreground">{`${String(file.rowCount)} rows`}</span>
      <Button variant="ghost" size="sm">
        Choose another
      </Button>
    </span>
  );
}

function Dock({
  props,
  ready,
  skipped,
}: {
  props: ImportPageProps;
  ready: number;
  skipped: number;
}) {
  const { phase } = props;
  if (phase === 'upload' || phase === 'done') return null;
  const blocked = phase === 'mapping' && mappingProblems(props.mapping).length > 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card py-1.5 pr-1.5 pl-4 shadow-lg">
      {phase === 'committing' ? (
        <>
          <p className="text-sm tabular-nums">{`Imported ${String(Math.round(ready * 0.7))} of ${String(ready)}`}</p>
          <Progress value={70} className="w-64" aria-label="Import progress" />
        </>
      ) : (
        <p className="text-sm tabular-nums">
          {phase === 'mapping'
            ? `${String(props.file.rowCount)} rows to check`
            : `${String(ready)} to import, ${String(skipped)} to skip`}
        </p>
      )}
      <span className="ml-auto" />
      <Button variant="ghost" size="sm" disabled={phase === 'committing'}>
        Back
      </Button>
      {phase === 'mapping' ? (
        <Button size="sm" disabled={blocked}>
          Check {props.file.rowCount} rows
        </Button>
      ) : (
        <Button size="sm" loading={phase === 'committing'} disabled={phase === 'committing'}>
          {skipped > 0
            ? `Import ${String(ready)}, skip ${String(skipped)}`
            : `Import ${String(ready)} items`}
        </Button>
      )}
    </div>
  );
}

function stepOf(phase: ImportPhase) {
  if (phase === 'committing' || phase === 'done') return 'import' as const;
  return phase;
}

/** The import page. */
export function ImportPage(props: ImportPageProps) {
  const { phase } = props;
  const drafts = applyMapping(props.rows, props.mapping);
  const issues = validateRows(drafts, props.context);
  const skipped = new Set(issues.map((issue) => issue.row)).size;
  const ready = drafts.length - skipped;
  const typeTree: readonly TypeTreeRecord[] = props.context.types.map((type) => ({
    id: type.id,
    label: type.label,
    parentTypeId: type.parentTypeId ?? null,
  }));
  const guessed = new Set(
    guessMapping(props.headers)
      .filter((column) => column.target !== 'skip')
      .map((column) => `${column.header}:${column.target}`)
  );
  return (
    <InventoryPage
      title="Import CSV"
      icon={FileUp}
      description="Bring a spreadsheet of things in as items."
      actions={phase === 'upload' ? null : <FileLine file={props.file} />}
      toolbar={
        <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
          <ImportSteps current={stepOf(phase)} done={phase === 'done'} />
          {phase === 'preview' ? (
            <span className="ml-auto flex items-center gap-2">
              <Switch
                id="only-problems"
                checked={props.onlyProblems ?? false}
                onCheckedChange={() => undefined}
              />
              <Label
                htmlFor="only-problems"
                className="font-normal"
              >{`Only rows to skip (${String(skipped)})`}</Label>
            </span>
          ) : null}
        </div>
      }
      dock={<Dock props={props} ready={ready} skipped={skipped} />}
    >
      {phase === 'upload' ? <UploadStep refused={props.refused} /> : null}
      {phase === 'mapping' ? (
        <MappingStep mapping={props.mapping} rows={props.rows} guessed={guessed} />
      ) : null}
      {phase === 'preview' || phase === 'committing' ? (
        <PreviewStep
          rows={drafts}
          issues={issues}
          onlyProblems={props.onlyProblems}
          typeTree={props.typeTreePreview ? typeTree : undefined}
        />
      ) : null}
      {phase === 'done' ? (
        <ImportDone imported={ready} skipped={skipped} file={props.file.name} />
      ) : null}
    </InventoryPage>
  );
}
