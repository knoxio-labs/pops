import type { DurableUploadInput } from './durable-upload-api';

/** Digest the selected bytes without persisting their content. */
export async function digestFile(file: File): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Capture the original File metadata and fingerprint under its already allocated operation identity. */
export async function prepareUploadInput(
  operationId: string,
  file: File
): Promise<DurableUploadInput> {
  const sha256 = await digestFile(file);
  return Object.freeze({
    operationId,
    fileName: file.name,
    mimeType: file.type,
    byteLength: file.size,
    sha256,
  });
}
