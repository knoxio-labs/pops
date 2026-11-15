import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';
import type { UploadJournal } from './durable-upload-journal';

/** Digest the selected bytes without persisting their content. */
export async function digestFile(file: File): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Capture the original File metadata and fingerprint under its already allocated operation identity. */
export async function prepareUploadInput(
  operationId: string,
  file: File | null
): Promise<DurableUploadInput> {
  if (file === null) throw new Error('Select the original file before uploading.');
  const sha256 = await digestFile(file);
  return Object.freeze({
    operationId,
    fileName: file.name,
    mimeType: file.type,
    byteLength: file.size,
    sha256,
  });
}

/** Check reattached bytes against the immutable input while retaining the original journal authority. */
export async function verifyReattachedFile(
  file: File,
  state: {
    input: DurableUploadInput | null;
    needsRecovery: boolean;
    record: DurableUploadRecord | null;
  },
  journal: UploadJournal
): Promise<void> {
  const { input, needsRecovery, record } = state;
  if (
    input === null ||
    needsRecovery ||
    (record !== null && record.state !== 'awaiting_content' && record.state !== 'admitted')
  )
    throw new Error('Check upload status before reattaching the original file.');
  await journal.verify();
  if (file.size !== input.byteLength || (await digestFile(file)) !== input.sha256)
    throw new Error(
      'This file does not match the retained upload fingerprint. Select the original file.'
    );
  journal.assertCurrent();
}
