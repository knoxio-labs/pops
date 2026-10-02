/**
 * Turns a user's query into an FTS5 MATCH expression for the lexical leg.
 *
 * Only runs of letters and digits survive, each wrapped in double quotes, so
 * nothing the user typed reaches FTS5 as syntax: `AND`, `NEAR`, `*`, `-`, `:`
 * and quotes all become plain words or vanish.
 *
 * Tokens are joined with OR. A question carries words its answer does not
 * ("what did I decide about ..."), so AND would return nothing for most
 * natural-language queries; BM25 already ranks an engram matching the rare
 * words above one matching a common word.
 *
 * OR makes every matched token admit a hit, and BM25 only lowers a common
 * word's rank, never removes the match. Function words are therefore dropped
 * before matching, or any engram containing "the" would be a hit for every
 * question. A query made only of such words is searched as typed.
 */
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const MAX_QUERY_TOKENS = 32;

const STOP_WORDS = new Set(
  (
    'a about an and are as at be been but by can could did do does for from had has have how i ' +
    'if in into is it its me my of on or our s should so t that the their them then there these ' +
    'they this to was we were what when where which who whom why will with would you your'
  ).split(' ')
);

/** The distinct, lower-cased search terms of `query`, function words removed. */
export function tokenizeQuery(query: string): string[] {
  const tokens = [...new Set(query.normalize('NFKC').toLowerCase().match(TOKEN_PATTERN) ?? [])];
  const content = tokens.filter((token) => !STOP_WORDS.has(token));
  return (content.length > 0 ? content : tokens).slice(0, MAX_QUERY_TOKENS);
}

/**
 * The FTS5 MATCH expression for `query`, or null when it holds no searchable
 * term. The result is always passed to SQLite as a bound parameter.
 */
export function buildMatchExpression(query: string): string | null {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"`).join(' OR ');
}
