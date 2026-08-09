/**
 * Line-level YAML helpers shared by the guards that must read YAML **before
 * `pnpm install` has run**.
 *
 * Most guard jobs (`agent-review.yml`, and several in `quality.yml`,
 * `rust-quality.yml` and `docker-build.yml`) execute straight after
 * `actions/checkout` with no `node_modules` on disk, so a real parser is not
 * importable at the moment they run. That constraint — not preference — is why
 * hand-rolled matching exists here at all, and it is recorded in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md)
 * along with the rule that a shape a matcher cannot model must be reported
 * rather than skipped.
 *
 * Given that the matching has to be hand-rolled, it lives in ONE place. The
 * defect this module exists to prevent is a guard that quietly matches nothing
 * and therefore reports green, which is the exact failure a guard is supposed
 * to be immune to.
 */

/**
 * Drop a YAML trailing comment.
 *
 * A `#` opens a comment only at the start of a line or after whitespace, per
 * the YAML spec. Truncating at the first `#` anywhere on the line eats real
 * content — an image coordinate, a URL fragment, a password — and the
 * truncated remainder then fails to match whatever the caller was looking for,
 * so the guard sees nothing and reports clean.
 *
 * Quoted `#` is still mishandled (`name: "a # b"` loses its tail). Closing
 * that needs a parser, not a better regex; the callers compensate by treating
 * a shape they cannot model as a violation.
 *
 * @param {string} line
 * @returns {string}
 */
export function stripComment(line) {
  const at = line.search(/(^|\s)#/u);
  return at === -1 ? line : line.slice(0, at);
}

/**
 * True when a YAML line opens a **block** mapping under `key` — i.e. the key
 * is present and carries no inline value.
 *
 * The distinction matters because every indentation-driven scanner in this
 * directory can only walk a block mapping. `services: {web: {…}}` is valid
 * YAML that such a scanner steps straight past, so callers use
 * {@link inlineValueFor} to tell "no such key" (nothing to check) apart from
 * "the key is there in a form I cannot read" (report it).
 *
 * @param {string} line
 * @param {string} key
 * @returns {boolean}
 */
export function opensBlockMapping(line, key) {
  return inlineValueFor(line, key) === '';
}

/**
 * The inline value written after `key:` on this line, `''` when the key is
 * present but opens a block, and `undefined` when the line is not that key.
 *
 * @param {string} line
 * @param {string} key
 * @returns {string | undefined}
 */
export function inlineValueFor(line, key) {
  const code = stripComment(line);
  const match = new RegExp(`^\\s*(?:["']?)${key}(?:["']?)\\s*:(.*)$`, 'u').exec(code);
  return match === null ? undefined : (match[1] ?? '').trim();
}
