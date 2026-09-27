import { Check, Clock3, ImageIcon, LoaderCircle, RotateCw, TriangleAlert, X } from 'lucide-react';

import { ButtonPrimitive, FileUpload, Progress, cn } from '@pops/ui';

import { formatBytes, photoSummary, type PhotoUpload } from './photo-queue';

import type { ReactElement } from 'react';

function statusLine(photo: PhotoUpload): string {
  if (photo.status.kind === 'staged') return 'Uploads when you save';
  if (photo.status.kind === 'uploading') return `Uploading, ${photo.status.percent}%`;
  if (photo.status.kind === 'attached') return 'Attached';
  return `Did not upload: ${photo.status.reason}.`;
}

function StatusMessage({ photo }: { photo: PhotoUpload }): ReactElement {
  const failed = photo.status.kind === 'failed';
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs text-muted-foreground',
        failed && 'text-destructive'
      )}
    >
      <StatusIcon photo={photo} />
      <span className="truncate">{statusLine(photo)}</span>
    </span>
  );
}

function StatusIcon({ photo }: { photo: PhotoUpload }): ReactElement {
  if (photo.status.kind === 'staged') return <Clock3 className="size-3.5 shrink-0" aria-hidden />;
  if (photo.status.kind === 'uploading')
    return <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />;
  if (photo.status.kind === 'attached')
    return <Check className="size-3.5 shrink-0 text-app-accent" aria-hidden />;
  return <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden />;
}

function PhotoRow({
  photo,
  onRemove,
  onRetry,
}: {
  photo: PhotoUpload;
  onRemove: () => void;
  onRetry: () => void;
}): ReactElement {
  const failed = photo.status.kind === 'failed';
  const uploading = photo.status.kind === 'uploading';
  const canRemove = photo.status.kind === 'staged' || failed;
  return (
    <li className="flex min-h-12 items-center gap-2.5 py-1.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm">{photo.fileName}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatBytes(photo.bytes)}
          </span>
        </span>
        <StatusMessage photo={photo} />
        {uploading ? (
          <Progress
            value={photo.status.percent}
            className="mt-1 h-1"
            aria-label={`${photo.fileName} upload`}
          />
        ) : null}
      </span>
      {failed ? (
        <ButtonPrimitive
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Retry ${photo.fileName}`}
          onClick={onRetry}
        >
          <RotateCw className="size-3.5" aria-hidden />
        </ButtonPrimitive>
      ) : null}
      {canRemove ? (
        <ButtonPrimitive
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${photo.fileName}`}
          onClick={onRemove}
          className="text-muted-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </ButtonPrimitive>
      ) : null}
    </li>
  );
}

/** Props for the item form's photo picker and upload queue. */
export interface PhotosFieldProps {
  readonly photos: readonly PhotoUpload[];
  readonly refused: readonly string[];
  readonly onRemove: (localId: string) => void;
  readonly onRetry: (localId: string) => void;
  /** Files selected from the drop zone or its file picker. */
  readonly onFiles: (files: readonly File[]) => void;
}

/** Renders photo selection, upload progress, refusals and retry/remove actions. */
export function PhotosField({
  photos,
  refused,
  onRemove,
  onRetry,
  onFiles,
}: PhotosFieldProps): ReactElement {
  const summary = photoSummary(photos);
  return (
    <section aria-labelledby="item-photos" className="flex min-h-0 min-w-0 flex-col gap-2">
      <h3 id="item-photos" className="text-sm font-medium">
        Photos
      </h3>
      <FileUpload
        multiple
        accept="image/*"
        acceptHint={null}
        prompt="Add from disk"
        onFilesSelected={onFiles}
      />
      <p className="text-xs text-muted-foreground">
        JPEG, PNG or HEIC up to 20 MB. Drop them here.
      </p>
      {photos.length > 0 ? (
        <ul
          aria-label="Photos"
          className="max-h-40 divide-y divide-border/60 overflow-y-auto rounded-md border px-2"
        >
          {photos.map((photo) => (
            <PhotoRow
              key={photo.localId}
              photo={photo}
              onRemove={() => onRemove(photo.localId)}
              onRetry={() => onRetry(photo.localId)}
            />
          ))}
        </ul>
      ) : null}
      {summary === null ? null : <p className="text-xs text-muted-foreground">{summary}</p>}
      {refused.map((reason) => (
        <p key={reason} className="text-xs text-destructive" role="alert">
          {reason} It was not added.
        </p>
      ))}
    </section>
  );
}
