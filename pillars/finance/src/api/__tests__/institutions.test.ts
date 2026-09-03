/**
 * Integration tests for the `institutions.*` REST surface. Covers
 * create/list round-tripping, the case-insensitive 409 conflict mapping,
 * the zod hex-colour validation, and delete (see the note below on why the
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
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-institutions-test-'));
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

describe('institutions — happy paths', () => {
  it('starts with the two migration-seeded institutions', async () => {
    const { data } = await client().institutions.list();
    expect(data.map((i) => i.name).toSorted()).toEqual(['ANZ', 'Amex']);
  });

  it('creates an institution and round-trips it through list', async () => {
    const created = await client().institutions.create({ name: 'Westpac', colour: '#007dba' });
    expect(created.data).toMatchObject({
      name: 'Westpac',
      colour: '#007dba',
      logoAssetId: null,
    });
    expect(created.message).toBe('Institution created');

    const { data } = await client().institutions.list();
    expect(data.map((i) => i.name)).toContain('Westpac');
  });

  it('deletes an institution that nothing references', async () => {
    const created = await client().institutions.create({ name: 'Westpac', colour: '#007dba' });

    const deleted = await client().institutions.delete(created.data.id);
    expect(deleted.message).toBe('Institution deleted');

    const { data } = await client().institutions.list();
    expect(data.map((i) => i.id)).not.toContain(created.data.id);
  });
});

describe('institutions — error mapping', () => {
  it('409s a name that already exists', async () => {
    await client().institutions.create({ name: 'Westpac', colour: '#007dba' });

    await expect(
      client().institutions.create({ name: 'Westpac', colour: '#000000' })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('409s a name that differs only in case', async () => {
    await client().institutions.create({ name: 'Westpac', colour: '#007dba' });

    await expect(
      client().institutions.create({ name: 'westpac', colour: '#000000' })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a missing colour', async () => {
    await expect(client().institutions.create({ name: 'Westpac' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects a colour missing the #', async () => {
    await expect(
      client().institutions.create({ name: 'Westpac', colour: '007dba' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a colour with the wrong length', async () => {
    await expect(
      client().institutions.create({ name: 'Westpac', colour: '#07dba' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a colour with non-hex characters', async () => {
    await expect(
      client().institutions.create({ name: 'Westpac', colour: '#zzzzzz' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('404s deleting an institution that does not exist', async () => {
    await expect(client().institutions.delete('missing-id')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('409s deleting an institution an account references (POPS-2767)', async () => {
    const institution = await client().institutions.create({ name: 'Westpac', colour: '#d5001c' });
    await client().accounts.create({
      name: 'Westpac Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: institution.data.id,
    });

    await expect(client().institutions.delete(institution.data.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});
