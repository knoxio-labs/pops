import { FileSpreadsheet, FileUp } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button, Label, Switch } from '@pops/ui';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { downloadCsv, templateCsv } from '../../foundation/list-page/inventory-csv.js';
import { MAX_LABEL_IDS, labelsHref } from '../labels-page/label-params.js';
import { ImportDock } from './import-dock.js';
import { ImportDone } from './import-done.js';
import { ImportSteps } from './import-steps.js';
import { MappingStep } from './mapping-step.js';
import { PreviewStep } from './preview-step.js';
import { UploadStep } from './upload-step.js';
import { useImport } from './use-import.js';

import type { ReactElement } from 'react';

import type { ImportPhase, ImportState } from './use-import.js';

function FileLine({
  file,
  onChooseAnother,
}: {
  file: NonNullable<ImportState['file']>;
  onChooseAnother: () => void;
}): ReactElement {
  return (
    <span className="flex items-center gap-2 text-sm">
      <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">{file.name}</span>
      <span className="text-muted-foreground">{`${String(file.rowCount)} rows`}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onChooseAnother}>
        Choose another
      </Button>
    </span>
  );
}

function stepOf(phase: ImportPhase): 'upload' | 'mapping' | 'preview' | 'import' {
  if (phase === 'committing' || phase === 'done') return 'import';
  return phase;
}

function ImportToolbar({ state }: { state: ImportState }): ReactElement {
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
      <ImportSteps current={stepOf(state.phase)} done={state.phase === 'done'} />
      {state.phase === 'preview' ? (
        <span className="ml-auto flex items-center gap-2">
          <Switch
            id="only-problems"
            checked={state.onlyProblems}
            onCheckedChange={state.setOnlyProblems}
          />
          <Label
            htmlFor="only-problems"
            className="font-normal"
          >{`Only rows to skip (${String(state.skipped)})`}</Label>
        </span>
      ) : null}
    </div>
  );
}

interface ImportContentProps {
  state: ImportState;
  onShowInItems: () => void;
  onPrintLabels: () => void;
  printDisabledReason: string | undefined;
  onUndo: () => void;
}

function ImportContent({
  state,
  onShowInItems,
  onPrintLabels,
  printDisabledReason,
  onUndo,
}: ImportContentProps): ReactElement | null {
  if (state.phase === 'upload') {
    return (
      <UploadStep
        refused={state.refused}
        onFile={(file) => void state.load(file)}
        onTemplate={() => downloadCsv('inventory-import-template.csv', templateCsv())}
      />
    );
  }
  if (state.phase === 'mapping') {
    return (
      <MappingStep
        mapping={state.mapping}
        rows={state.rows}
        guessed={state.guessed}
        onTarget={state.setTarget}
      />
    );
  }
  if (state.phase === 'preview' || state.phase === 'committing') {
    return <PreviewStep results={state.results} onlyProblems={state.onlyProblems} />;
  }
  if (state.file === null) return null;
  return (
    <ImportDone
      imported={state.imported}
      skipped={state.skipped}
      file={state.file.name}
      onDownloadSkipped={state.downloadSkipped}
      onShowInItems={onShowInItems}
      onPrintLabels={onPrintLabels}
      printDisabledReason={printDisabledReason}
      onUndo={onUndo}
    />
  );
}

/** Renders the CSV upload, mapping, preview, partial commit, and undo workflow. */
export function ImportPage(): ReactElement {
  const navigate = useNavigate();
  const state = useImport();

  const onShowInItems = (): void => {
    void navigate('/inventory/items?sort=updated');
  };
  const onPrintLabels = (): void => {
    if (state.createdIds.length > MAX_LABEL_IDS) return;
    void navigate(labelsHref(state.createdIds));
  };
  const onUndo = (): void => {
    void state.undo().then((result) => {
      const kept = result.kept.length === 0 ? '' : ` ${result.kept.length} could not be removed.`;
      toast(`Removed ${result.removed.length} items.${kept}`);
    });
  };
  const printDisabledReason =
    state.createdIds.length > MAX_LABEL_IDS
      ? `Print labels takes at most ${String(MAX_LABEL_IDS)} items`
      : undefined;

  return (
    <InventoryPage
      title="Import CSV"
      icon={FileUp}
      description="Bring a spreadsheet of things in as items."
      actions={
        state.file === null || state.phase === 'upload' ? null : (
          <FileLine file={state.file} onChooseAnother={state.reset} />
        )
      }
      toolbar={<ImportToolbar state={state} />}
      dock={<ImportDock state={state} />}
    >
      <ImportContent
        state={state}
        onShowInItems={onShowInItems}
        onPrintLabels={onPrintLabels}
        printDisabledReason={printDisabledReason}
        onUndo={onUndo}
      />
    </InventoryPage>
  );
}
