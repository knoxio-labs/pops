/**
 * Real-parser access to the YAML and TOML that the **Tier B** guards read, plus
 * the two rules ADR-045 attaches to reading structured config at all:
 *
 *   1. A document that does not parse is a **violation**, never a crash and
 *      never silence. {@link ConfigParseError} carries a message a guard can
 *      print verbatim as its finding.
 *   2. A key is found by walking the parsed document, not by matching a line.
 *      {@link walkMappings} is the one traversal every guard uses, so "the key
 *      was written as a flow mapping" stops being a shape anyone can miss.
 *
 * Tier B is the half of the guard fleet whose jobs run `pnpm install
 * --frozen-lockfile` precisely so this module is importable — see the tier
 * amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 * A guard in a Tier A (install-free) job must not import this file: there is no
 * `node_modules` on disk when it runs, and the failure is a `MODULE_NOT_FOUND`
 * inside a required check. `scripts/ci/__tests__/guard-job-tiers.test.ts`
 * enforces that both ways round.
 */

import { CORE_SCHEMA, load as loadYaml } from 'js-yaml';
import { parse as parseTomlSource } from 'smol-toml';

/**
 * A structured-config document that could not be parsed.
 *
 * Thrown rather than returned so a guard cannot accidentally treat an
 * unparseable file as an empty one — the exact "scanned nothing, reported OK"
 * failure ADR-045 exists to end. Guards catch it and record the message as a
 * violation.
 */
export class ConfigParseError extends Error {
  /**
   * @param {string} label  What was being read, for the failure message.
   * @param {unknown} cause
   */
  constructor(label, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${label} could not be parsed: ${detail}`);
    this.name = 'ConfigParseError';
    this.cause = cause;
  }
}

/**
 * Parse a YAML document under the **core** schema.
 *
 * The schema is passed explicitly rather than left to the default, because a
 * guard's correctness depends on it. YAML 1.1 resolves `on`, `yes` and `no` to
 * booleans; the core schema leaves them strings, which is the only reason
 * `doc.on` reads back as a GitHub Actions workflow's trigger block instead of
 * `undefined`. A guard reading `undefined` there finds nothing and reports
 * clean — so pinning the schema keeps a `js-yaml` upgrade from changing what
 * these guards can see. `scripts/ci/__tests__/config-parse.test.ts` asserts it.
 *
 * @param {string} text
 * @param {string} label  Path or name used in a parse failure message.
 * @returns {unknown}
 * @throws {ConfigParseError}
 */
export function parseYaml(text, label) {
  try {
    return loadYaml(text, { schema: CORE_SCHEMA });
  } catch (error) {
    throw new ConfigParseError(label, error);
  }
}

/**
 * Parse a TOML document.
 *
 * @param {string} text
 * @param {string} label  Path or name used in a parse failure message.
 * @returns {Record<string, unknown>}
 * @throws {ConfigParseError}
 */
export function parseToml(text, label) {
  let parsed;
  try {
    parsed = parseTomlSource(text);
  } catch (error) {
    throw new ConfigParseError(label, error);
  }
  if (!isMapping(parsed)) {
    throw new ConfigParseError(label, 'top level is not a table');
  }
  return parsed;
}

/**
 * True for a plain key/value node — the shape both YAML mappings and TOML
 * tables land in, and the only one {@link walkMappings} descends into by key.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isMapping(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @typedef {object} MappingEntry
 * @property {string[]} path   Key path from the document root, array indices included.
 * @property {string} key      The entry's own key.
 * @property {unknown} value   The entry's value.
 */

/**
 * Yield every key/value entry in a document, at any depth, descending through
 * both mappings and sequences.
 *
 * This is what replaces "scan the file for a line starting with `image:`". The
 * traversal cannot be evaded by a flow mapping, an unusual indent, a quoted
 * key, or a trailing comment, because by the time it runs those spellings have
 * all collapsed to the same tree.
 *
 * @param {unknown} node
 * @param {string[]} [prefix]
 * @returns {Generator<MappingEntry>}
 */
export function* walkMappings(node, prefix = []) {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      yield* walkMappings(item, [...prefix, String(index)]);
    }
    return;
  }
  if (!isMapping(node)) return;
  for (const [key, value] of Object.entries(node)) {
    const path = [...prefix, key];
    yield { path, key, value };
    yield* walkMappings(value, path);
  }
}

/**
 * Render a key path for a human-readable finding (`services.home-assistant`).
 *
 * @param {string[]} path
 * @returns {string}
 */
export function formatPath(path) {
  return path.length === 0 ? '<root>' : path.join('.');
}

/**
 * Coerce a scalar config value to the string a guard compares against.
 *
 * Returns `undefined` for anything that is not a scalar, so a caller never
 * stringifies a table into `[object Object]` and then matches on it.
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function scalarText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/**
 * {@link scalarText}, but a non-scalar raises instead of returning `undefined`.
 *
 * Use this wherever a scalar is the only shape the caller can rule on. Dropping
 * the entry silently — `.filter(v => v !== undefined)` over a list, a `continue`
 * over a map — turns a document the guard cannot read into a shorter document
 * it reads happily, which is ADR-045's "a shape you cannot model is a
 * violation, not a pass" broken in the passing direction.
 *
 * @param {unknown} value
 * @param {string} label  Path or name used in the failure message.
 * @param {string} where  Key path of the offending value.
 * @returns {string}
 * @throws {ConfigParseError}
 */
export function requireScalar(value, label, where) {
  const text = scalarText(value);
  if (text !== undefined) return text;
  throw new ConfigParseError(label, `${where} is ${shapeOf(value)}, not a single value`);
}

/**
 * Name a value's shape for a failure message.
 *
 * @param {unknown} value
 * @returns {string}
 */
function shapeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a sequence';
  if (isMapping(value)) return 'a mapping';
  return `of type ${typeof value}`;
}
