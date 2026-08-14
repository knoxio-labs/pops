import { encodeFile } from './encode.js';
import { MAX_RECEIPT_PARTS, nextPartId, receiptMediaType, type StagedPart } from './parts.js';

/**
 * Something that happened to a chosen file and did not end in a staged part.
 *
 * Reported rather than swallowed: a supermarket receipt sent as its first
 * eight frames is not the receipt the user photographed, and nothing
 * downstream can tell that the rest was dropped on the way.
 */
export type StagingProblem =
  | { readonly kind: 'rejected'; readonly names: string[] }
  | { readonly kind: 'unreadable'; readonly names: string[] }
  | { readonly kind: 'tooMany'; readonly dropped: number };

export interface Staging {
  readonly parts: StagedPart[];
  readonly problems: StagingProblem[];
}

export const EMPTY_STAGING: Staging = { parts: [], problems: [] };

/** One batch of chosen files, after the browser has been asked for their bytes. */
export interface EncodedBatch {
  readonly encoded: StagedPart[];
  /** Files whose media type the upload does not accept. */
  readonly rejected: string[];
  /** Files the browser refused to read. */
  readonly unreadable: string[];
}

/**
 * Fold one batch into the staged receipt, keeping the order the files were
 * chosen in and stopping at the contract's bound.
 *
 * The problems replace the previous ones rather than accumulating: they
 * describe the batch just added, and a complaint about a file the user has
 * since dealt with is noise.
 */
export function stage(current: Staging, batch: EncodedBatch): Staging {
  const room = Math.max(0, MAX_RECEIPT_PARTS - current.parts.length);
  const fitting = batch.encoded.slice(0, room);
  const dropped = batch.encoded.length - fitting.length;

  const problems: StagingProblem[] = [];
  if (batch.rejected.length > 0) problems.push({ kind: 'rejected', names: batch.rejected });
  if (batch.unreadable.length > 0) problems.push({ kind: 'unreadable', names: batch.unreadable });
  if (dropped > 0) problems.push({ kind: 'tooMany', dropped });

  return { parts: [...current.parts, ...fitting], problems };
}

/**
 * Fold files refused before they ever reached {@link encodeBatch} — the drop
 * zone applies the same accept filter itself, so a dragged-in `.heic` is turned
 * away there — into the current problems.
 *
 * They merge into the batch's own rejection rather than sitting beside it: one
 * gesture that mixes both produced one list of names for the reader, and two
 * separate complaints would read as two separate mistakes.
 */
export function withRefused(current: Staging, names: readonly string[]): Staging {
  if (names.length === 0) return current;
  const rejected = current.problems.filter((problem) => problem.kind === 'rejected');
  const merged: StagingProblem = {
    kind: 'rejected',
    names: [...rejected.flatMap((problem) => problem.names), ...names],
  };
  return {
    parts: current.parts,
    problems: [merged, ...current.problems.filter((problem) => problem.kind !== 'rejected')],
  };
}

/**
 * Read every chosen file into a part, one at a time so the staged order is the
 * order they were chosen in rather than the order they happened to finish in.
 */
export async function encodeBatch(files: readonly File[]): Promise<EncodedBatch> {
  const encoded: StagedPart[] = [];
  const rejected: string[] = [];
  const unreadable: string[] = [];

  for (const file of files) {
    const mediaType = receiptMediaType(file);
    if (mediaType === null) {
      rejected.push(file.name);
      continue;
    }
    try {
      encoded.push({
        id: nextPartId(),
        name: file.name,
        mediaType,
        dataBase64: await encodeFile(file),
        byteLength: file.size,
      });
    } catch {
      unreadable.push(file.name);
    }
  }

  return { encoded, rejected, unreadable };
}
