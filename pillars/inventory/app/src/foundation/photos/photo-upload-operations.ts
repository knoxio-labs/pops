import { InventoryApiError } from '../../inventory-api-helpers.js';
import { sendInventoryMutation } from '../../inventory-web/mutation-client.js';
import { type PhotoFile, type PhotoStatus } from './photo-queue';

import type { InventoryMutationOutcome } from '../../inventory-web/mutation-client.js';

const MEDIA_UPLOAD_TIMEOUT_MS = 30_000;

interface MediaUploadError {
  readonly reason: string;
}

function isHeicName(name: string): boolean {
  return /\.(?:heic|heif)$/iu.test(name);
}

/** Converts a browser File into the metadata retained by the queue. */
export function toPhotoFile(file: File, localId: string): PhotoFile {
  return {
    localId,
    fileName: file.name,
    bytes: file.size,
    mimeType: file.type === '' && isHeicName(file.name) ? 'image/heic' : file.type,
  };
}

/** Returns lower-case hexadecimal SHA-256 for the supplied bytes. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reasonForOutcome(
  outcome: Exclude<InventoryMutationOutcome, { status: 'applied' }>
): string {
  if (outcome.status === 'rejected') return outcome.message;
  if (outcome.status === 'conflict') return 'the item changed';
  return 'the inventory service did not answer';
}

function mediaReason(status: number, responseText: string): MediaUploadError {
  if (status === 413) return { reason: 'the file is too large' };
  if (status === 415) return { reason: 'that file type is not a photo' };
  if (status === 400 && responseText.includes('hash_mismatch'))
    return { reason: 'the upload was damaged' };
  return { reason: 'the inventory service did not answer' };
}

function uploadMedia(
  url: string,
  blob: Blob,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.timeout = MEDIA_UPLOAD_TIMEOUT_MS;
    request.setRequestHeader('Content-Type', 'image/jpeg');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      if (request.status === 200 || request.status === 201) resolve();
      else reject(mediaReason(request.status, request.responseText));
    };
    request.onerror = () => reject({ reason: 'the inventory service did not answer' });
    request.ontimeout = () => reject({ reason: 'the inventory service did not answer' });
    request.onabort = () => reject({ reason: 'the inventory service did not answer' });
    request.send(blob);
  });
}

/** Inputs for one processed media upload and the subsequent attach mutation. */
export interface UploadPhotoOptions {
  readonly file: File;
  readonly itemId: string;
  readonly position: number;
  readonly processFiles: (files: File[]) => Promise<Array<{ processed: Blob }>>;
  readonly setStatus: (localId: string, status: PhotoStatus) => void;
  readonly localId: string;
}

function errorReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'reason' in error) {
    const reason = error.reason;
    if (typeof reason === 'string' && reason !== '') return reason;
  }
  return 'the inventory service did not answer';
}

/** Processes, stores and attaches one photo, returning whether the attach applied. */
export async function uploadPhoto(options: UploadPhotoOptions): Promise<boolean> {
  let processed: Array<{ processed: Blob }>;
  try {
    processed = await options.processFiles([options.file]);
  } catch {
    options.setStatus(options.localId, { kind: 'failed', reason: 'the photo could not be read' });
    return false;
  }
  const processedFile = processed[0];
  if (processedFile === undefined) {
    options.setStatus(options.localId, { kind: 'failed', reason: 'the photo could not be read' });
    return false;
  }
  try {
    const bytes = await processedFile.processed.arrayBuffer();
    const sha256 = await sha256Hex(bytes);
    await uploadMedia(`/inventory-api/media/${sha256}`, processedFile.processed, (percent) =>
      options.setStatus(options.localId, { kind: 'uploading', percent })
    );
    const outcome = await sendInventoryMutation({
      command: { op: 'item.attachPhoto', args: { sha256, position: options.position } },
      entityId: options.itemId,
    });
    if (outcome.status !== 'applied') {
      options.setStatus(options.localId, { kind: 'failed', reason: reasonForOutcome(outcome) });
      return false;
    }
    options.setStatus(options.localId, { kind: 'attached' });
    return true;
  } catch (error: unknown) {
    const reason =
      error instanceof InventoryApiError
        ? 'the inventory service did not answer'
        : errorReason(error);
    options.setStatus(options.localId, { kind: 'failed', reason });
    return false;
  }
}
