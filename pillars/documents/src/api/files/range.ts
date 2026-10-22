/**
 * Single byte-range support (RFC 9110 §14) for a body whose length is known.
 *
 * Paperless 3.2.1 answers `Range` with a full 200, so the download route
 * computes the range itself. Anything this does not understand — several
 * ranges, a malformed header, an unknown length — falls back to the full
 * body, which RFC 9110 permits a server to do with any range request.
 */

/** What to send for a request's `Range` header. */
export type RangeDecision =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly start: number; readonly end: number }
  | { readonly kind: 'unsatisfiable' };

const FULL: RangeDecision = { kind: 'full' };
const UNSATISFIABLE: RangeDecision = { kind: 'unsatisfiable' };

function fromStart(start: number, rawEnd: string, size: number): RangeDecision {
  if (start >= size) return UNSATISFIABLE;
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  return end < start ? FULL : { kind: 'partial', start, end };
}

/**
 * Decide how to answer `header` for a body of `size` bytes.
 *
 * @param header The request's `Range` value, if any.
 * @param size The body's length, or `null` when it is unknown.
 */
export function resolveByteRange(header: string | undefined, size: number | null): RangeDecision {
  if (header === undefined || size === null) return FULL;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return FULL;
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return FULL;
  if (size === 0) return UNSATISFIABLE;
  if (rawStart !== '') return fromStart(Number(rawStart), rawEnd, size);
  const suffix = Number(rawEnd);
  if (suffix === 0) return UNSATISFIABLE;
  return { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 };
}

/** Yield bytes `start`..`end` (inclusive) of `source`, abandoning it once `end` is passed. */
export async function* sliceBytes(
  source: AsyncIterable<Uint8Array>,
  start: number,
  end: number
): AsyncGenerator<Uint8Array> {
  let offset = 0;
  for await (const chunk of source) {
    const from = Math.max(0, start - offset);
    const to = Math.min(chunk.length, end + 1 - offset);
    if (to > from) yield chunk.subarray(from, to);
    offset += chunk.length;
    if (offset > end) return;
  }
}
