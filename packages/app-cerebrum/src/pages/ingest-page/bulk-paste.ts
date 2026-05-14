/**
 * Bulk paste helpers (PRD-081 US-08).
 *
 * Splits the capture body on `---` separator lines into N engram segments,
 * skipping empty segments. The split happens client-side; each surviving
 * segment is submitted as its own quickCapture mutation.
 */

const SEPARATOR_LINE = /^\s*---\s*$/;
const PREVIEW_CHARS = 60;

export interface BulkSegment {
  /** 0-based index in the original paste, useful for error reporting. */
  index: number;
  /** Segment body, normalised (trimmed leading/trailing blank lines). */
  body: string;
  /** Short preview for the inline submit-button affordance. */
  preview: string;
}

/**
 * Split `body` on `---` separator lines. Returns an empty array when the body
 * contains no non-empty segments.
 */
export function splitOnSeparator(body: string): BulkSegment[] {
  const lines = body.split('\n');
  const segments: string[][] = [[]];
  for (const line of lines) {
    if (SEPARATOR_LINE.test(line)) {
      segments.push([]);
    } else {
      segments[segments.length - 1]?.push(line);
    }
  }
  const out: BulkSegment[] = [];
  for (const [index, segLines] of segments.entries()) {
    const text = segLines.join('\n').trim();
    if (text.length === 0) continue;
    out.push({ index, body: text, preview: previewOf(text) });
  }
  return out;
}

/** Whether the body contains at least one separator line. */
export function hasSeparator(body: string): boolean {
  return body.split('\n').some((line) => SEPARATOR_LINE.test(line));
}

function previewOf(text: string): string {
  // Replace newlines with spaces so the preview stays a single line.
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= PREVIEW_CHARS) return flat;
  return `${flat.slice(0, PREVIEW_CHARS - 1).trimEnd()}…`;
}
