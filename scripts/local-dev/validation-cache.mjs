import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** A successful typecheck's exact input fingerprint and covered units. */
/** @typedef {{version:1, fingerprint:string, units:string[], scripts:boolean}} ValidationReceipt */

/**
 * Read only complete receipts. Corrupt, old or partial cache files are misses.
 * @param {string} file
 * @returns {ValidationReceipt | null}
 */
export function readReceipt(file) {
  try {
    /** @type {unknown} */
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (
      value === null ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== 1 ||
      !('fingerprint' in value) ||
      typeof value.fingerprint !== 'string' ||
      !('units' in value) ||
      !Array.isArray(value.units) ||
      !value.units.every((/** @type {unknown} */ unit) => typeof unit === 'string') ||
      !('scripts' in value) ||
      typeof value.scripts !== 'boolean'
    )
      return null;
    return {
      version: 1,
      fingerprint: value.fingerprint,
      units: value.units,
      scripts: value.scripts,
    };
  } catch {
    return null;
  }
}

/**
 * A broader successful check can cover a narrower plan with identical inputs.
 * @param {ValidationReceipt | null} receipt
 * @param {string} fingerprint
 * @param {readonly string[]} units
 * @param {boolean} scripts
 * @returns {boolean}
 */
export function coversValidation(receipt, fingerprint, units, scripts) {
  return (
    receipt !== null &&
    receipt.fingerprint === fingerprint &&
    (!scripts || receipt.scripts) &&
    units.every((unit) => receipt.units.includes(unit))
  );
}

/**
 * Publish a success only when validation's inputs stayed unchanged throughout.
 * @param {string} file
 * @param {{before:string, after:string, status:number, units:string[], scripts:boolean}} outcome
 * @returns {boolean}
 */
export function writeReceipt(file, outcome) {
  if (outcome.status !== 0 || outcome.before !== outcome.after) {
    invalidateReceipt(file);
    return false;
  }
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.new`;
  writeFileSync(
    temporary,
    JSON.stringify({
      version: 1,
      fingerprint: outcome.after,
      units: outcome.units,
      scripts: outcome.scripts,
    }) + '\n',
    { mode: 0o600 }
  );
  renameSync(temporary, file);
  return true;
}

/** Remove older evidence when a new validation attempt fails or starts afresh.
 * @param {string} file
 */
export function invalidateReceipt(file) {
  rmSync(file, { force: true });
}
