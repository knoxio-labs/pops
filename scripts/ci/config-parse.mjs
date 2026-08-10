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

import { load as loadYaml } from 'js-yaml';
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
 * Parse a YAML document.
 *
 * `js-yaml`'s default (core) schema leaves `on:`, `yes:` and `no:` as strings,
 * so a GitHub Actions workflow's `on` key survives the round trip. That is not
 * true of YAML 1.1 parsers, and a guard that reads `doc.on` would silently see
 * `undefined` under one.
 *
 * @param {string} text
 * @param {string} label  Path or name used in a parse failure message.
 * @returns {unknown}
 * @throws {ConfigParseError}
 */
export function parseYaml(text, label) {
  try {
    return loadYaml(text);
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
