import type { ReceiptMediaType, ReceiptPart } from './types.js';

/**
 * How many parts one receipt may be sent as.
 *
 * The contract enforces this bound and the generated client carries no schema
 * to read it from, so staging a ninth part here would produce a refusal with
 * nothing on screen explaining which parts were the problem.
 */
export const MAX_RECEIPT_PARTS = 8;

/**
 * One part staged in the browser, before the upload.
 *
 * `name` is null for a pasted body, which has no file behind it to name.
 */
export interface StagedPart {
  readonly id: string;
  readonly name: string | null;
  readonly mediaType: ReceiptMediaType;
  readonly dataBase64: string;
  readonly byteLength: number;
}

/**
 * Every media type the upload accepts, and the file extensions that carry it.
 *
 * A total record rather than a list, mirroring the pillar's own map: a media
 * type added to the contract stops this compiling instead of quietly becoming
 * a kind of receipt the drop zone refuses.
 */
const EXTENSIONS: Readonly<Record<ReceiptMediaType, readonly string[]>> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
};

function isAcceptedMediaType(candidate: string): candidate is ReceiptMediaType {
  return Object.hasOwn(EXTENSIONS, candidate);
}

/**
 * The media type to declare for a chosen file, or null when the upload would
 * not accept it.
 *
 * The browser's own `type` is believed first. It is empty for a file dragged
 * from some sources, hence the extension fallback — which can be wrong about
 * bytes that do not match their name, and the server says so with a refusal
 * this page renders rather than guessing further.
 */
export function receiptMediaType(file: {
  readonly name: string;
  readonly type: string;
}): ReceiptMediaType | null {
  const declared = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (isAcceptedMediaType(declared)) return declared;

  const name = file.name.toLowerCase();
  for (const [mediaType, extensions] of Object.entries(EXTENSIONS)) {
    if (!extensions.some((extension) => name.endsWith(extension))) continue;
    if (isAcceptedMediaType(mediaType)) return mediaType;
  }
  return null;
}

let staged = 0;

/** A key for one staged part, stable across reordering and removal. */
export function nextPartId(): string {
  staged += 1;
  return `staged-part-${String(staged)}`;
}

export function removePartAt(parts: readonly StagedPart[], index: number): StagedPart[] {
  return parts.filter((_, position) => position !== index);
}

/** Move one part earlier (`-1`) or later (`1`), or leave the list alone at its ends. */
export function movePart(
  parts: readonly StagedPart[],
  index: number,
  offset: -1 | 1
): StagedPart[] {
  const target = index + offset;
  const moved = parts[index];
  const displaced = parts[target];
  if (moved === undefined || displaced === undefined) return [...parts];

  const next = [...parts];
  next[index] = displaced;
  next[target] = moved;
  return next;
}

export function toRequestParts(parts: readonly StagedPart[]): ReceiptPart[] {
  return parts.map(({ mediaType, dataBase64 }) => ({ mediaType, dataBase64 }));
}
