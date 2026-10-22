import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileUpload,
  formatBytes,
  Select,
  TextInput,
} from '@pops/ui';

import {
  DOCUMENT_KIND_OPTIONS,
  isDocumentKind,
  type DocumentKind,
} from '../../components/document-kinds';
import { acceptFor, uploadRefusal } from './document-upload-limits';

import type { ReactElement } from 'react';

import type { DocumentUploadLimits } from './detail-model';
import type { DocumentUploadInput } from './document-upload-api';

function limitsHint(limits: DocumentUploadLimits | null): string {
  if (limits === null) return 'Paperless checks the size and type when the file arrives.';
  return `${limits.allowedMimeTypes.join(', ')}, up to ${formatBytes(limits.maxUploadBytes)}`;
}

function FilePicker({
  limits,
  file,
  onFile,
}: {
  limits: DocumentUploadLimits | null;
  file: File | null;
  onFile: (file: File | null) => void;
}): ReactElement {
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <FileUpload
        accept={limits === null ? undefined : acceptFor(limits)}
        maxSize={limits?.maxUploadBytes}
        acceptHint={limitsHint(limits)}
        files={file === null ? [] : [file]}
        onRemoveFile={() => onFile(null)}
        onFilesSelected={(files) => {
          setRefusal(null);
          onFile(files[0] ?? null);
        }}
        onError={(reason) => {
          setRefusal(uploadRefusal(reason));
          onFile(null);
        }}
      />
      {refusal === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {refusal}
        </p>
      )}
    </div>
  );
}

/** Props for {@link DocumentUploadDialog}. */
export interface DocumentUploadDialogProps {
  itemId: string;
  /** Documents' limits; null leaves the size and type check to the server. */
  limits: DocumentUploadLimits | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (input: DocumentUploadInput) => void;
}

/** Picks one file, its kind and an optional title, and hands them to `onUpload`. Mount it only while open. */
export function DocumentUploadDialog({
  itemId,
  limits,
  busy,
  onOpenChange,
  onUpload,
}: DocumentUploadDialogProps): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentKind>('other');
  const [title, setTitle] = useState('');
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add file</DialogTitle>
          <DialogDescription>The file is stored in Paperless and linked here.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <FilePicker limits={limits} file={file} onFile={setFile} />
          <Select
            label="Kind"
            value={documentType}
            options={DOCUMENT_KIND_OPTIONS}
            onChange={(event) => {
              if (isDocumentKind(event.target.value)) setDocumentType(event.target.value);
            }}
          />
          <TextInput
            label="Title (optional)"
            value={title}
            maxLength={128}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={file === null || busy}
            onClick={() => {
              if (file !== null) onUpload({ itemId, file, documentType, title });
            }}
          >
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
