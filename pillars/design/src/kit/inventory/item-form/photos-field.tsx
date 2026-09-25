/**
 * Photos, from disk. While creating, a chosen photo waits in the page and
 * uploads once the item exists; each row says so, so nobody wonders whether
 * it will be kept (POPS-3632 dropped them). A failed upload never undoes the
 * save: the item exists and the row offers Retry.
 */
import {
  Check,
  Clock,
  ImageIcon,
  ImagePlus,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
  X,
} from 'lucide-react';

import { Button, ButtonPrimitive, Progress, cn } from '@pops/ui';

import { FieldProblem } from '../field-editors/field-note';
import { formatBytes, photoSummary } from './photo-queue';

import type { PhotoUpload } from './photo-queue';

function statusLine(photo: PhotoUpload): string {
  const { status } = photo;
  if (status.kind === 'staged') return 'Uploads when you save';
  if (status.kind === 'uploading') return `Uploading, ${status.percent}%`;
  if (status.kind === 'attached') return 'Attached';
  return `Did not upload: ${status.reason}.`;
}

const STATUS_ICON = {
  staged: Clock,
  uploading: LoaderCircle,
  attached: Check,
  failed: TriangleAlert,
};

function RowActions({
  photo,
  onRemove,
  onRetry,
}: {
  photo: PhotoUpload;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const kind = photo.status.kind;
  return (
    <>
      {kind === 'failed' ? (
        <ButtonPrimitive
          variant="ghost"
          size="icon-xs"
          aria-label={`Retry ${photo.fileName}`}
          onClick={onRetry}
        >
          <RotateCw className="size-3.5" aria-hidden />
        </ButtonPrimitive>
      ) : null}
      {kind === 'staged' || kind === 'failed' ? (
        <ButtonPrimitive
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${photo.fileName}`}
          onClick={onRemove}
          className="text-muted-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </ButtonPrimitive>
      ) : null}
    </>
  );
}

function PhotoRow({
  photo,
  onRemove,
  onRetry,
}: {
  photo: PhotoUpload;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const kind = photo.status.kind;
  const Icon = STATUS_ICON[kind];
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
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Icon
            className={cn(
              'size-3.5 shrink-0',
              kind === 'attached' && 'text-app-accent',
              kind === 'failed' && 'text-warning',
              kind === 'uploading' && 'animate-spin'
            )}
            aria-hidden
          />
          <span className={cn('truncate', kind === 'failed' && 'text-foreground')}>
            {statusLine(photo)}
          </span>
        </span>
        {kind === 'uploading' ? (
          <Progress
            value={photo.status.kind === 'uploading' ? photo.status.percent : 0}
            className="mt-1 h-1"
            aria-label={`${photo.fileName} upload`}
          />
        ) : null}
      </span>
      <RowActions photo={photo} onRemove={onRemove} onRetry={onRetry} />
    </li>
  );
}

/** Props for {@link PhotosField}. */
export interface PhotosFieldProps {
  photos: readonly PhotoUpload[];
  refused: readonly string[];
  onAdd: () => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}

/** The photo picker and its queue. */
export function PhotosField({ photos, refused, onAdd, onRemove, onRetry }: PhotosFieldProps) {
  const summary = photoSummary(photos);
  return (
    <section
      aria-labelledby="item-photos"
      className="flex min-h-0 min-w-0 flex-col gap-1.5 lg:flex-1"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="item-photos" className="text-sm font-medium">
          Photos
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAdd}
          prefix={<ImagePlus className="size-4" aria-hidden />}
          className="-mr-2 text-muted-foreground"
        >
          Add from disk
        </Button>
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          JPEG, PNG or HEIC up to 20 MB. Drop them here.
        </p>
      ) : (
        <ul
          aria-label="Photos"
          className="max-h-40 divide-y divide-border/60 overflow-y-auto rounded-md border px-2 lg:max-h-none lg:min-h-0 lg:shrink"
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
      )}
      {summary === null ? null : <p className="text-xs text-muted-foreground">{summary}</p>}
      {refused.map((reason) => (
        <FieldProblem key={reason}>{reason} It was not added.</FieldProblem>
      ))}
    </section>
  );
}
