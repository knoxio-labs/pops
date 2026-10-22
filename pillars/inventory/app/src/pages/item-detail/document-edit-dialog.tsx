import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  TextInput,
} from '@pops/ui';

import {
  DOCUMENT_KIND_OPTIONS,
  isDocumentKind,
  type DocumentKind,
} from '../../components/document-kinds';

import type { ReactElement } from 'react';

import type { DetailDocument } from './detail-model';
import type { DocumentChanges } from './use-document-mutations';

const MAX_TITLE_LENGTH = 128;

interface DocumentDraft {
  title: string;
  documentType: DocumentKind;
}

/** Why a draft cannot be saved, or null when it can. */
export function documentDraftProblem(draft: DocumentDraft): string | null {
  const title = draft.title.trim();
  if (title.length === 0) return 'A document needs a title.';
  if (title.length > MAX_TITLE_LENGTH) return `Titles are at most ${MAX_TITLE_LENGTH} characters.`;
  return null;
}

/** The PATCH body for a draft: only the keys whose value differs from the document. */
export function documentChanges(
  document: Pick<DetailDocument, 'title' | 'documentType'>,
  draft: DocumentDraft
): DocumentChanges {
  const title = draft.title.trim();
  return {
    ...(title === document.title ? {} : { title }),
    ...(draft.documentType === document.documentType ? {} : { documentType: draft.documentType }),
  };
}

function initialDraft(document: DetailDocument): DocumentDraft {
  return {
    title: document.title,
    documentType: isDocumentKind(document.documentType) ? document.documentType : 'other',
  };
}

function EditFields({
  draft,
  problem,
  onDraft,
}: {
  draft: DocumentDraft;
  problem: string | null;
  onDraft: (draft: DocumentDraft) => void;
}): ReactElement {
  return (
    <div className="grid gap-3">
      <TextInput
        label="Title"
        value={draft.title}
        maxLength={MAX_TITLE_LENGTH}
        error={problem ?? undefined}
        onChange={(event) => onDraft({ ...draft, title: event.target.value })}
      />
      <Select
        label="Kind"
        value={draft.documentType}
        options={DOCUMENT_KIND_OPTIONS}
        onChange={(event) => {
          if (isDocumentKind(event.target.value)) {
            onDraft({ ...draft, documentType: event.target.value });
          }
        }}
      />
    </div>
  );
}

/** Props for {@link DocumentEditDialog}. */
export interface DocumentEditDialogProps {
  document: DetailDocument;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with only the changed keys; never called with none. */
  onSave: (changes: DocumentChanges) => void;
}

/** Renames a linked document and changes its kind. Mount it only while open. */
export function DocumentEditDialog({
  document,
  busy,
  onOpenChange,
  onSave,
}: DocumentEditDialogProps): ReactElement {
  const [draft, setDraft] = useState(() => initialDraft(document));
  const problem = documentDraftProblem(draft);
  const changes = documentChanges(document, draft);
  const unchanged = Object.keys(changes).length === 0;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
          <DialogDescription>A new title is saved in Paperless too.</DialogDescription>
        </DialogHeader>
        <EditFields draft={draft} problem={problem} onDraft={setDraft} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={problem !== null || unchanged || busy} onClick={() => onSave(changes)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
