/**
 * Shared helpers for document generation modes — report, summary, timeline.
 */
import type { SourceCitation } from '../query/types.js';
import type { RetrievalResult } from '../retrieval/types.js';
import type { DateRange, GeneratedDocument, GenerationResult } from './types.js';

const EXCERPT_MAX_LENGTH = 200;

/** Extract the actual date range covered by retrieved results. */
export function extractDateRange(results: RetrievalResult[]): DateRange | null {
  const dates: string[] = [];
  for (const r of results) {
    const createdAt = r.metadata['createdAt'] as string | undefined;
    if (createdAt) dates.push(createdAt);
  }
  if (dates.length === 0) return null;
  const sorted = dates.toSorted();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  return { from: first, to: last };
}

/** Truncate at the word boundary with an ellipsis. */
export function truncateExcerpt(text: string): string {
  if (text.length <= EXCERPT_MAX_LENGTH) return text;
  const truncated = text.slice(0, EXCERPT_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > 0 ? lastSpace : EXCERPT_MAX_LENGTH;
  return text.slice(0, cutPoint) + '...';
}

/** Extract primary scope from retrieval result metadata. */
export function extractPrimaryScope(result: RetrievalResult): string {
  const scopes = result.metadata['scopes'] as string[] | undefined;
  return scopes?.[0] ?? 'unknown';
}

/** Map retrieval results to source citations. */
export function toSourceCitations(results: RetrievalResult[]): SourceCitation[] {
  return results.map((r) => ({
    id: r.sourceId,
    type: r.sourceType,
    title: r.title,
    excerpt: truncateExcerpt(r.contentPreview ?? ''),
    relevance: r.score,
    scope: extractPrimaryScope(r),
  }));
}

/** Result returned when the model declines to synthesise the document. */
export const REFUSED_RESULT: GenerationResult = {
  document: null,
  notice: 'The model declined to generate this document',
};

/** Outline text returned by a preview when the model declines to write one. */
export const REFUSED_OUTLINE = 'The model declined to generate an outline for these sources.';

/** Stamp a built document with whether the model's output was cut off. */
export function withOutputTruncated(
  document: GeneratedDocument,
  outputTruncated: boolean
): GeneratedDocument {
  return { ...document, metadata: { ...document.metadata, outputTruncated } };
}

/** Extract title from LLM output (first H1 line) or return fallback. */
export function extractTitle(llmOutput: string, fallback: string): string {
  const titleMatch = llmOutput.match(/^#\s+(.+)$/m);
  return titleMatch?.[1] ?? fallback;
}

/** Collect unique scope prefixes from results. */
export function collectScopeCoverage(results: RetrievalResult[]): string[] {
  const scopes = new Set<string>();
  for (const r of results) {
    const s = (r.metadata['scopes'] as string[] | undefined) ?? [];
    for (const scope of s) scopes.add(scope);
  }
  return [...scopes];
}
