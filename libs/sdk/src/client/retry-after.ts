/**
 * The three HTTP-date formats RFC 9110 §5.6.7 allows a sender to produce
 * (still all legal to RECEIVE, so all three are matched), checked by shape
 * before the value is ever handed to `Date.parse` — see
 * {@link parseRetryAfterSeconds}'s docstring for why the shape gate exists:
 * IMF-fixdate (`Sun, 06 Nov 1994 08:49:37 GMT`, the format RFC 9110 requires
 * SENDERS use), the obsolete RFC 850 format (`Sunday, 06-Nov-94 08:49:37
 * GMT`), and the obsolete asctime format (`Sun Nov  6 08:49:37 1994`).
 */
const HTTP_DATE_SHAPE =
  /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2} \d{2}:\d{2}:\d{2} GMT|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?: \d|\d{2}) \d{2}:\d{2}:\d{2} \d{4})$/;

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110 §10.2.3).
 * Both forms are honoured; a header the producer did not send, or one this
 * parser cannot make sense of, is `undefined` rather than a guessed number —
 * a caller with no better information should fall back to its own backoff,
 * not be handed a number that looks authoritative and isn't.
 *
 * The delta-seconds form is matched against `/^\d+$/` on the TRIMMED value
 * before it ever reaches `Number()` — RFC 9110's delta-seconds is `1*DIGIT`,
 * a non-negative integer, nothing else. This is what rejects an empty or
 * whitespace-only header as "cannot make sense of" rather than as the `0`
 * `Number('')`/`Number('   ')` would otherwise produce (read by a caller as
 * "retry immediately", not as "producer sent nothing"), and it rejects a
 * hex-looking value like `0x10` the same way `Number` would otherwise accept
 * it as 16.
 *
 * The HTTP-date form is gated the same way: the TRIMMED value must match one
 * of the three shapes {@link HTTP_DATE_SHAPE} recognises before it reaches
 * `Date.parse`. `Date.parse` alone is not a validator — V8's legacy parser
 * accepts near-miss delta-seconds spellings the digit guard above rejects
 * (`+10`, `-5`, `12.5`, `10,20`) as dates in 2001, which are in the past,
 * which the `Math.max(0, …)` clamp below turns into `retryAfterSeconds: 0` —
 * exactly the "retry immediately" guess the digit guard exists to prevent,
 * just reached through the other branch. Gating on shape first closes that:
 * anything that is not delta-seconds AND not a recognisable HTTP-date is
 * "cannot make sense of", i.e. `undefined`.
 *
 * The upper end is deliberately left unclamped: nothing in this SDK schedules
 * a timer off `retryAfterSeconds` today, so there is no real bound to pick,
 * and an invented one would just be a second guess sitting next to the one
 * this function already refuses to make. A caller that eventually does
 * schedule off this value is the one with the context to decide its own
 * ceiling.
 */
export function parseRetryAfterSeconds(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (raw === null) return undefined;

  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Math.max(0, Number(trimmed));
  if (!HTTP_DATE_SHAPE.test(trimmed)) return undefined;

  const whenMs = Date.parse(trimmed);
  if (Number.isNaN(whenMs)) return undefined;
  return Math.max(0, Math.round((whenMs - Date.now()) / 1000));
}
