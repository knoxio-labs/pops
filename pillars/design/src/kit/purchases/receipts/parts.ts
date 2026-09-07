import type { StagedPart } from '@/fixtures/purchases-receipt-intake';

/** How many parts one receipt may be sent as, mirroring the pillar's upload contract. */
export const MAX_RECEIPT_PARTS = 8;

const EXTENSIONS: Readonly<Record<StagedPart['mediaType'], readonly string[]>> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
};

/** The `accept` attribute for the drop zone's file input. */
export const RECEIPT_ACCEPT: string = Object.entries(EXTENSIONS)
  .flatMap(([mediaType, extensions]) => [mediaType, ...extensions])
  .join(',');

function isAcceptedMediaType(candidate: string): candidate is StagedPart['mediaType'] {
  return Object.hasOwn(EXTENSIONS, candidate);
}

/**
 * The media type to stage a chosen file as, or null when the upload would not
 * accept it. The browser's own `type` is believed first, falling back to the
 * file's extension for the sources that report an empty one.
 */
export function receiptMediaType(file: {
  readonly name: string;
  readonly type: string;
}): StagedPart['mediaType'] | null {
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
