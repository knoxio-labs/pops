/**
 * Photos added in the item form. A photo chosen while creating is held in
 * the page until the item exists, then uploads against the new id; none is
 * dropped on the way (POPS-3632 discarded them). In edit mode the item
 * exists already, so a photo uploads as soon as it is chosen.
 */

/** Where one photo stands. */
export type PhotoStatus =
  | { kind: 'staged' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'attached' }
  | { kind: 'failed'; reason: string };

/** One photo in the form's queue. */
export interface PhotoUpload {
  localId: string;
  fileName: string;
  bytes: number;
  status: PhotoStatus;
}

/** A file offered to the queue. */
export interface PhotoFile {
  localId: string;
  fileName: string;
  bytes: number;
  mimeType: string;
}

/** The largest photo the media route takes. */
export const PHOTO_BYTE_LIMIT = 20 * 1024 * 1024;

/** Why a file cannot be added at all, or null. */
export function photoRefusal(file: PhotoFile): string | null {
  if (!file.mimeType.startsWith('image/')) return `${file.fileName} is not an image.`;
  if (file.bytes > PHOTO_BYTE_LIMIT) return `${file.fileName} is over 20 MB.`;
  return null;
}

/**
 * Adds chosen files. Creating: staged until Save. Editing: uploading now.
 * Refused files are returned separately so the form can say why.
 */
export function addPhotos(
  queue: readonly PhotoUpload[],
  files: readonly PhotoFile[],
  mode: 'create' | 'edit'
): { queue: PhotoUpload[]; refused: string[] } {
  const refused = files.flatMap((file) => photoRefusal(file) ?? []);
  const accepted = files
    .filter((file) => photoRefusal(file) === null)
    .map<PhotoUpload>((file) => ({
      localId: file.localId,
      fileName: file.fileName,
      bytes: file.bytes,
      status: mode === 'create' ? { kind: 'staged' } : { kind: 'uploading', percent: 0 },
    }));
  return { queue: [...queue, ...accepted], refused };
}

/** The item now exists: every staged photo starts uploading against it. */
export function startStagedUploads(queue: readonly PhotoUpload[]): PhotoUpload[] {
  return queue.map((photo) =>
    photo.status.kind === 'staged' ? { ...photo, status: { kind: 'uploading', percent: 0 } } : photo
  );
}

/** Takes one photo out of the queue. */
export function removePhoto(queue: readonly PhotoUpload[], localId: string): PhotoUpload[] {
  return queue.filter((photo) => photo.localId !== localId);
}

/** Sends a failed photo round again. */
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

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** One line on the queue as a whole, most pressing first; null when there is nothing to say. */
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

/** The size as a person reads it. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
