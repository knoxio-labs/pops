import { Undo2, Paperclip } from 'lucide-react';

import { Button, ComboboxSelect, FileUpload } from '@pops/ui';

import { CaptureFileChips } from '../trip-quick-capture/file-chips';
import { useRouteState } from '../trip-route-editing/canvas-state';
import { DocumentContext, useDocuments } from './context';
import { LinkedDocuments } from './documents';
import { initialDocumentLinking } from './fixture';
import { addDocumentFiles, setDocumentTarget } from './model';
import { DocumentReview } from './review';
import { DocumentSelector } from './selector';

import type { DocumentLinkingScenario } from './fixture';

function FileCapture() {
  const { state, change } = useDocuments();
  return (
    <section aria-label="New files" className="space-y-3 border-t pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="size-4 text-app-accent" />
        New files
      </h2>
      <FileUpload
        multiple
        prompt="Choose or drop files"
        acceptHint={null}
        onFilesSelected={(files) => change(addDocumentFiles(state, files))}
      />
      {state.files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Selected files · not uploaded</p>
          <CaptureFileChips files={state.files} onChange={(files) => change({ ...state, files })} />
        </div>
      )}
    </section>
  );
}

/** Attach existing Documents references or stage browser files without inventing uploaded records. */
export function DocumentWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'inline' | 'picker';
  scenario?: DocumentLinkingScenario;
}) {
  const history = useRouteState(() => initialDocumentLinking(scenario));
  const { state, change } = history;
  const target = state.targets.find((item) => item.id === state.targetId);
  return (
    <DocumentContext value={{ state, change }}>
      <DocumentReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-4 px-5 py-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Documents</h1>
          <Button variant="ghost" onClick={history.undo} disabled={!history.canUndo}>
            <Undo2 className="size-4" />
            Undo
          </Button>
        </header>
        <article className="space-y-4 rounded-xl border border-foreground/30 bg-muted/60 p-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Link to</p>
            <ComboboxSelect
              aria-label="Link to"
              value={target?.id ?? ''}
              placeholder="Choose a trip or item"
              options={state.targets.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(id) => change(setDocumentTarget(state, id))}
            />
            {!target && (
              <p role="alert" className="text-sm text-destructive">
                Choose a trip or item before linking.
              </p>
            )}
          </div>
          <LinkedDocuments />
          <DocumentSelector layout={layout} />
          <FileCapture />
        </article>
      </main>
    </DocumentContext>
  );
}
