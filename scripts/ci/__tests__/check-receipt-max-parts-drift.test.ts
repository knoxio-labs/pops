/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. These drive `findViolations`/`extractConstant` over fixture source
 * it must flag — a mismatch, a renamed constant, a missing file, a
 * non-integer value — and over source it must not, so a regex that silently
 * stops matching fails here rather than in a PR six months from now.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractConstant, findViolations, SOURCES } from '../check-receipt-max-parts-drift.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const fixtureSources = [
  {
    label: 'purchases MAX_RECEIPT_PARTS',
    path: 'purchases.ts',
    pattern: /export const MAX_RECEIPT_PARTS\s*=\s*(\d+)\s*;/u,
  },
  {
    label: 'bfm MOBILE_RECEIPT_MAX_PARTS',
    path: 'bfm.ts',
    pattern: /export const MOBILE_RECEIPT_MAX_PARTS\s*=\s*(\d+)\s*;/u,
  },
  {
    label: 'iOS ReceiptPart.maxPerReceipt',
    path: 'ReceiptPart.swift',
    pattern: /public static let maxPerReceipt\s*=\s*(\d+)/u,
  },
];

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'receipt-max-parts-drift-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(files: Record<string, string>): void {
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), contents);
  }
}

describe('extractConstant', () => {
  it('parses a well-formed constant', () => {
    write({ 'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n' });
    const result = extractConstant(root, fixtureSources[0]!);
    expect(result.value).toBe(8);
    expect(result.error).toBeNull();
  });

  it('reports a missing file rather than throwing', () => {
    const result = extractConstant(root, fixtureSources[0]!);
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/does not exist/u);
  });

  it('reports a renamed constant rather than silently matching nothing', () => {
    write({ 'purchases.ts': 'export const MAXIMUM_RECEIPT_PARTS = 8;\n' });
    const result = extractConstant(root, fixtureSources[0]!);
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/was not found/u);
  });

  it('reports a non-integer value rather than coercing it', () => {
    write({ 'purchases.ts': 'export const MAX_RECEIPT_PARTS = eight;\n' });
    const result = extractConstant(root, fixtureSources[0]!);
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/was not found/u);
  });
});

describe('findViolations', () => {
  it('reports no violation when all three constants agree', () => {
    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 8;\n',
      'ReceiptPart.swift': 'public static let maxPerReceipt = 8\n',
    });
    expect(findViolations(root, fixtureSources).violations).toHaveLength(0);
  });

  it('reports a mismatch, naming both disagreeing sources and their values', () => {
    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 6;\n',
      'ReceiptPart.swift': 'public static let maxPerReceipt = 8\n',
    });
    const { violations } = findViolations(root, fixtureSources);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/purchases MAX_RECEIPT_PARTS = 8/u);
    expect(violations[0]).toMatch(/bfm MOBILE_RECEIPT_MAX_PARTS = 6/u);
  });

  it('reports a three-way mismatch as one violation naming every value', () => {
    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 6;\n',
      'ReceiptPart.swift': 'public static let maxPerReceipt = 4\n',
    });
    const { violations } = findViolations(root, fixtureSources);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/= 8/u);
    expect(violations[0]).toMatch(/= 6/u);
    expect(violations[0]).toMatch(/= 4/u);
  });

  it('reports a missing constant instead of comparing only the ones it found', () => {
    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 8;\n',
      // ReceiptPart.swift intentionally absent.
    });
    const { violations } = findViolations(root, fixtureSources);
    expect(violations.some((v) => v.includes('does not exist'))).toBe(true);
  });

  it('does not report a false mismatch when a source is missing and the rest agree', () => {
    // Discovery-floor failures and value-drift failures are reported
    // separately; a guard that only found two sources must not also claim
    // those two "disagree" with a value that was never read.
    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 8;\n',
    });
    const { violations } = findViolations(root, fixtureSources);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/does not exist/u);
  });

  it('the real repo tree has no drift right now', () => {
    expect(findViolations(repoRoot, SOURCES).violations).toEqual([]);
  });

  it('SOURCES resolves all three real files with no drift, proving the guard still finds its real subjects', () => {
    const { results } = findViolations(repoRoot, SOURCES);
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.error, `${result.source.label}: ${result.error}`).toBeNull();
      expect(result.value).toBe(8);
    }
  });
});
