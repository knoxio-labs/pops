import { FileText, X } from 'lucide-react';

import { Button, FileUpload, Textarea } from '@pops/ui';

import { DocumentPicker } from '../documents/DocumentPicker';
import { CaptureDetails } from './CaptureDetails';
import { CaptureUpload } from './CaptureUpload';

import type { JSX } from 'react';

import type { CaptureComposerProps } from './composer-types';

/** Text-first composer shared by all approved source surfaces; optional fields stay explicit. */
export function CaptureComposer(props: CaptureComposerProps): JSX.Element {
  const { session, state, view } = props;
  const editor = session.editor;
  const submit = (): void => {
    if (state.busy || state.composerLocked) return;
    editor.editDraft({ explore: view === 'explore' });
    void editor.capture();
  };
  return (
    <section
      aria-label="Capture composer"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <Textarea
        aria-label={view === 'explore' ? 'Save possibility' : 'Capture text'}
        placeholder={view === 'explore' ? 'Save a possibility…' : 'Paste or type anything…'}
        value={state.draft.originalText}
        disabled={state.composerLocked}
        onChange={(event) => editor.editDraft({ originalText: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <CaptureDetails {...props} />
      <ComposerFiles {...props} />
      <ComposerSelections {...props} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={state.composerLocked} onClick={() => editor.clearDraft()}>
          Clear
        </Button>
        <Button
          disabled={
            state.busy ||
            state.composerLocked ||
            (!state.draft.originalText.trim() &&
              !state.draft.originalUrl.trim() &&
              state.draft.selections.length === 0)
          }
          onClick={submit}
        >
          {view === 'explore' ? 'Save' : 'Capture'}
        </Button>
      </div>
    </section>
  );
}
function ComposerSelections({
  session,
  state,
  documentsClient,
}: CaptureComposerProps): JSX.Element {
  return (
    <div className="space-y-2">
      {state.draft.selections.map((selection) =>
        session.upload(selection.id) ? (
          <CaptureUpload
            key={selection.id}
            session={session}
            selection={selection}
            documentsClient={documentsClient}
            locked={state.composerLocked}
          />
        ) : (
          <div
            key={selection.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
          >
            <span className="flex items-center gap-2">
              <FileText className="size-4" aria-hidden />
              {selection.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${selection.name}`}
              disabled={state.composerLocked}
              onClick={() => session.editor.removeSelection(selection.id)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function ComposerFiles(props: CaptureComposerProps): JSX.Element {
  const { session, state } = props;
  const editor = session.editor;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <FileUpload
        className="min-w-0 flex-1"
        multiple
        prompt="Choose files"
        acceptHint={null}
        disabled={state.composerLocked}
        onFilesSelected={(files) => files.forEach((file) => session.addFile(file))}
      />
      <DocumentPicker
        documentsClient={props.documentsClient}
        onSelected={(document) => {
          if (editor.getState().composerLocked)
            throw new Error('The composer is reserved for Undo');
          editor.addSelection({
            file: null,
            name: document.title,
            mediaType: null,
            references: [{ kind: 'document', documentId: document.id }],
          });
        }}
      />
    </div>
  );
}
