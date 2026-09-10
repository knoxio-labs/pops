/**
 * The shell's E2E transaction mirrors, against finance's committed contract.
 *
 * `pillars/shell/e2e/*.spec.ts` hand-mirror finance's `ParsedTransaction` /
 * `ProcessedTransaction` shapes so `fulfilWith` can validate the body it
 * mocks. Their own header says the mirrors exist so "a drift in the pillar's
 * contract reddens the spec rather than passing a body the app would not
 * accept". They could not do that: `fulfilWith` validates the mock against the
 * mirror declared in the SAME file, so a mirror that drifts along with its
 * fixture is the spec asserting its own copy against itself.
 *
 * It had drifted. `import-wizard-happy-path.spec.ts` declared `account:
 * z.string()`, a field the contract has never had, in place of the required
 * `dialectAccountLabel` — and its fixtures carried `account: 'Amex'` to match.
 * Both schemas are strict, so the mocked progress result was one the real
 * route could never return (POPS-3374).
 *
 * The shell may not import `@pops/finance` (`shell-no-cross-internal`), so the
 * comparison lives here, in root-owned `scripts/`, and reads finance's
 * COMMITTED OpenAPI rather than its source: that document is the published
 * contract, it is already regenerated and diffed by the codegen gates, and a
 * spec asserting against it is asserting against what the route answers.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const FINANCE_OPENAPI = join(repoRoot, 'pillars/finance/openapi/finance.openapi.json');

const E2E_DIR = join(repoRoot, 'pillars/shell/e2e');

/**
 * Every spec that mirrors the transaction shape, discovered rather than listed.
 *
 * A hardcoded list would leave the next spec's mirror unchecked, which is the
 * state this file exists to end. A spec that mirrors nothing (the live-draft
 * one types its draft rows inline) is simply not discovered.
 */
const MIRRORS = readdirSync(E2E_DIR)
  .filter((name) => name.endsWith('.spec.ts'))
  .filter((name) =>
    /const (Parsed|Processed)TransactionSchema/u.test(readFileSync(join(E2E_DIR, name), 'utf8'))
  )
  .map((name) => ({ spec: name }));

interface JsonSchema {
  properties?: Record<string, unknown>;
  required?: string[];
}

/**
 * The processed-transaction object as finance's OpenAPI describes it.
 *
 * Found by shape rather than by name: the document inlines its schemas — it
 * has no `components.schemas` at all — so there is no `$ref` to follow.
 * `dialectAccountLabel` beside `entity` identifies it unambiguously, and no
 * other object in the document carries both.
 */
function contractTransaction(): JsonSchema {
  const document: unknown = JSON.parse(readFileSync(FINANCE_OPENAPI, 'utf8'));
  const found: JsonSchema[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const properties = (node as JsonSchema).properties;
    if (properties !== undefined && 'dialectAccountLabel' in properties && 'entity' in properties) {
      found.push(node as JsonSchema);
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(document);
  const first = found[0];
  if (first === undefined) {
    throw new Error(`no processed-transaction object found in ${FINANCE_OPENAPI}`);
  }
  return first;
}

/**
 * The top-level keys a spec's transaction mirrors declare.
 *
 * Read from the `.object({ … })` / `.extend({ … })` bodies of the mirror
 * declarations, at brace depth 1 only, so a nested object's own keys
 * (`entity`, `ruleProvenance`, `matchedRules`) are not mistaken for
 * transaction fields. Indentation is not part of the test: the two mirrors are
 * written at different depths, and a scanner that pinned one of them would
 * silently read nothing from the other.
 */
export function mirroredTransactionKeys(specSource: string): Set<string> {
  const keys = new Set<string>();
  for (const name of ['ParsedTransactionSchema', 'ProcessedTransactionSchema']) {
    const start = specSource.indexOf(`const ${name}`);
    if (start === -1) continue;
    const open = specSource.indexOf('({', start);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open + 1; i < specSource.length; i += 1) {
      const ch = specSource[i];
      if (ch === '{' || ch === '(' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ')' || ch === ']') {
        depth -= 1;
        if (depth === 0) break;
      } else if (depth === 1 && ch === '\n') {
        const line = specSource.slice(i + 1, specSource.indexOf('\n', i + 1));
        const key = /^\s*(\w+)\s*:/u.exec(line)?.[1];
        if (key !== undefined) keys.add(key);
      }
    }
  }
  return keys;
}

describe('the shell E2E transaction mirrors', () => {
  const contract = contractTransaction();
  const contractKeys = new Set(Object.keys(contract.properties ?? {}));

  it('reads a contract shape with the fields a transaction actually has', () => {
    // The scan is structural. If it started matching some other object, every
    // comparison below would be against the wrong thing and still "pass".
    expect(contractKeys.has('dialectAccountLabel')).toBe(true);
    expect(contractKeys.has('checksum')).toBe(true);
    expect(contract.required).toContain('dialectAccountLabel');
  });

  it('finds at least one spec mirroring the shape, rather than checking nothing', () => {
    // ADR-045's floor. Discovery that silently matches no file would make this
    // suite pass hardest when it has stopped reading anything.
    expect(MIRRORS.length).toBeGreaterThan(0);
  });

  it.each(MIRRORS)('$spec declares no field the contract does not have', ({ spec }) => {
    // `account: z.string()` was the drift: a field the contract has never
    // carried, in a strict mirror, with fixtures written to match it.
    const declared = mirroredTransactionKeys(readFileSync(join(E2E_DIR, spec), 'utf8'));

    expect(declared.size).toBeGreaterThan(0);
    expect([...declared].filter((key) => !contractKeys.has(key))).toEqual([]);
  });

  it.each(MIRRORS)('$spec declares every field the contract requires', ({ spec }) => {
    // The other direction: a strict mirror missing a required field rejects
    // the body the real route would send.
    const declared = mirroredTransactionKeys(readFileSync(join(E2E_DIR, spec), 'utf8'));

    expect((contract.required ?? []).filter((key) => !declared.has(key))).toEqual([]);
  });
});

describe('mirroredTransactionKeys', () => {
  it('reads the top-level keys of a mirror declaration', () => {
    const source = [
      'const ParsedTransactionSchema = z',
      '  .object({',
      '    date: z.string(),',
      '    amount: z.number(),',
      '  })',
      '  .strict();',
    ].join('\n');

    expect([...mirroredTransactionKeys(source)].toSorted()).toEqual(['amount', 'date']);
  });

  it('does not read a nested object’s keys as transaction fields', () => {
    // `entity`, `ruleProvenance` and `matchedRules` all declare their own keys
    // inline. Counting those would compare the wrong set against the contract
    // and report drift that is not there.
    const source = [
      'const ProcessedTransactionSchema = ParsedTransactionSchema.extend({',
      '  entity: z',
      '    .object({',
      '      entityId: z.string(),',
      '    })',
      '    .strict(),',
      '  status: z.enum([]),',
      '}).strict();',
    ].join('\n');

    expect([...mirroredTransactionKeys(source)].toSorted()).toEqual(['entity', 'status']);
  });

  it('answers an empty set for a file that mirrors nothing', () => {
    expect(mirroredTransactionKeys('export const x = 1;').size).toBe(0);
  });
});
