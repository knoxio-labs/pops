/** The state of one photo selected in the item form. */
export type PhotoStatus =
  | { readonly kind: 'staged' }
  | { readonly kind: 'uploading'; readonly percent: number }
  | { readonly kind: 'attached' }
  | { readonly kind: 'failed'; readonly reason: string };

/** A photo held by the item form until it is attached or removed. */
export interface PhotoUpload {
  readonly localId: string;
  readonly fileName: string;
  readonly bytes: number;
  readonly status: PhotoStatus;
}

/** The metadata retained for a selected file before it is processed. */
export interface PhotoFile {
  readonly localId: string;
  readonly fileName: string;
  readonly bytes: number;
  readonly mimeType: string;
}

/** Maximum size accepted by the form before an image is processed. */
export const PHOTO_BYTE_LIMIT = 20 * 1024 * 1024;

/** Returns the reason a selected file cannot enter the queue. */
export function photoRefusal(file: PhotoFile): string | null {
  if (!file.mimeType.startsWith('image/')) return `${file.fileName} is not an image.`;
  if (file.bytes > PHOTO_BYTE_LIMIT) return `${file.fileName} is over 20 MB.`;
  return null;
}

/** Adds files to the queue, staging them for create mode and starting edit uploads. */
export function addPhotos(
  queue: readonly PhotoUpload[],
  files: readonly PhotoFile[],
  mode: 'create' | 'edit'
): { readonly queue: PhotoUpload[]; readonly refused: string[] } {
  const refused = files.flatMap((file) => {
    const reason = photoRefusal(file);
    return reason === null ? [] : [reason];
  });
  const accepted = files.flatMap((file): PhotoUpload[] => {
    if (photoRefusal(file) !== null) return [];
    return [
      {
        localId: file.localId,
        fileName: file.fileName,
        bytes: file.bytes,
        status: mode === 'create' ? { kind: 'staged' } : { kind: 'uploading', percent: 0 },
      },
    ];
  });
  return { queue: [...queue, ...accepted], refused };
}

/** Moves every staged photo into the uploading state. */
export function startStagedUploads(queue: readonly PhotoUpload[]): PhotoUpload[] {
  return queue.map((photo) =>
    photo.status.kind === 'staged' ? { ...photo, status: { kind: 'uploading', percent: 0 } } : photo
  );
}

/** Removes the queue entry with the given local id. */
export function removePhoto(queue: readonly PhotoUpload[], localId: string): PhotoUpload[] {
  return queue.filter((photo) => photo.localId !== localId);
}

/** Returns one failed queue entry to the uploading state. */
export function retryPhoto(queue: readonly PhotoUpload[], localId: string): PhotoUpload[] {
  return queue.map((photo) =>
    photo.localId === localId && photo.status.kind === 'failed'
      ? { ...photo, status: { kind: 'uploading', percent: 0 } }
      : photo
  );
}

function count(queue: readonly PhotoUpload[], kind: PhotoStatus['kind']): number {
  return queue.filter((photo) => photo.status.kind === kind).length;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Returns the queue summary shown below the photo rows, or null when settled. */
export function photoSummary(queue: readonly PhotoUpload[]): string | null {
  const failed = count(queue, 'failed');
  if (failed > 0) return `${plural(failed, 'photo')} did not upload. The item is saved.`;
  const uploading = count(queue, 'uploading');
  if (uploading > 0) {
    const done = count(queue, 'attached');
    return `Uploading ${done + 1} of ${done + uploading}.`;
  }
  const staged = count(queue, 'staged');
  if (staged > 0) return `${plural(staged, 'photo')} upload when you save.`;
  return null;
}

/** Formats a byte count for the photo field's size labels. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
