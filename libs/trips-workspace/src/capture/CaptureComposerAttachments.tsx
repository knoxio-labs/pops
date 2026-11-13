import { FileText, X } from 'lucide-react';

import { Button, FileUpload } from '@pops/ui';

import { DocumentPicker } from '../documents/DocumentPicker';
import { CaptureUpload } from './CaptureUpload';

import type { JSX } from 'react';

import type { CaptureComposerProps } from './composer-types';

/** Retained selections keep their real Files, accepted owner identities and upload recovery. */
export function CaptureComposerSelections({
  session,
  state,
  documentsClient,
}: CaptureComposerProps): JSX.Element | null {
  if (state.draft.selections.length === 0) return null;
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

/** Upload and owner-original selection share the existing retained session and selection callbacks. */
export function CaptureComposerFiles(props: CaptureComposerProps): JSX.Element {
  const { session, state } = props;
  const editor = session.editor;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FileUpload
        className={props.compact ? 'shrink-0' : 'min-w-0 flex-1'}
        multiple
        compact={props.compact}
        prompt={props.compact ? 'Upload a file' : 'Choose files'}
        acceptHint={null}
        disabled={state.composerLocked}
        onFilesSelected={(files) => files.forEach((file) => session.addFile(file))}
      />
      <DocumentPicker
        compact={props.compact}
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
