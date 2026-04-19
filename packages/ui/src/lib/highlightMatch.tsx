import type { ReactNode } from 'react';

/**
 * Highlight the matched portion of `text` based on `query` and `matchType`.
 * Returns a React node with the matched slice wrapped in a styled `<mark>`.
 *
 * - `exact` / `prefix` — highlights from the start of the string
 * - `contains` (default) — highlights the first occurrence anywhere
 */
export function highlightMatch(
  text: string,
  query: string,
  matchType: string = 'contains'
): ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const start = matchType === 'exact' || matchType === 'prefix' ? 0 : lowerText.indexOf(lowerQuery);

  if (start === -1) return text;

  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-warning/20 px-0.5 dark:bg-warning/30">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}
