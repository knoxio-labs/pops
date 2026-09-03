/**
 * Integration tests for the `currencies.*` REST surface. Covers create/list
 * round-tripping for both a points and a fiat currency, the 409 conflict
 * mapping on a duplicate code, and delete (see the note below on why the
 * in-use refusal isn't exercised here).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-currencies-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

describe('currencies — happy paths', () => {
  it('lists the seeded fiat and points currencies', async () => {
    const { data } = await client().currencies.list();
    const aud = data.find((c) => c.code === 'AUD');
    expect(aud).toMatchObject({ kind: 'fiat', symbol: '$', decimals: 2 });

    const points = data.filter((c) => c.kind === 'points');
    expect(points.length).toBeGreaterThanOrEqual(1);
    for (const currency of points) {
      expect(currency.symbol).toBeNull();
      expect(currency.decimals).toBe(0);
    }
  });

  it('creates a fiat currency and round-trips it through list', async () => {
    const created = await client().currencies.create({
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });
    expect(created.data).toMatchObject({
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });
    expect(created.message).toBe('Currency created');

    const { data } = await client().currencies.list();
    expect(data.map((c) => c.code)).toContain('CAD');
  });

  it('creates a points currency with a null symbol and zero decimals', async () => {
    const created = await client().currencies.create({
      code: 'FLYBUYS',
      name: 'Flybuys Points',
      decimals: 0,
      kind: 'points',
    });
    expect(created.data).toMatchObject({
      code: 'FLYBUYS',
      symbol: null,
      decimals: 0,
      kind: 'points',
    });
  });

  it('deletes a currency that nothing references', async () => {
    await client().currencies.create({
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });

    const deleted = await client().currencies.delete('CAD');
    expect(deleted.message).toBe('Currency deleted');

    const { data } = await client().currencies.list();
    expect(data.map((c) => c.code)).not.toContain('CAD');
  });
});

describe('currencies — error mapping', () => {
  it('409s a duplicate code', async () => {
    await client().currencies.create({
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: '$',
      decimals: 2,
      kind: 'fiat',
    });

    await expect(
      client().currencies.create({
        code: 'CAD',
        name: 'Duplicate',
        symbol: '$',
        decimals: 2,
        kind: 'fiat',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('404s deleting a currency that does not exist', async () => {
    await expect(client().currencies.delete('ZZZ')).rejects.toMatchObject({ status: 404 });
  });

  it('409s deleting AUD — the seeded Amex/ANZ accounts reference it (POPS-2767)', async () => {
    await expect(client().currencies.delete('AUD')).rejects.toMatchObject({ status: 409 });
  });
});
