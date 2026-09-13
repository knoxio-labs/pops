/**
 * The REST routes that write tag rules — `POST /tag-rules/apply` and
 * `PATCH /tag-rules/:id` — answer a marker-facet tag (POPS-3666) or a `temp:`
 * placeholder scope (POPS-3664) with a 400 and write nothing, the rule table
 * and the vocabulary alike.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-tagrule-guards-test-'));
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

function addOp(tags: string[], entityId: string | null = null) {
  return {
    ops: [
      { op: 'add', data: { descriptionPattern: 'ADGUARD', matchType: 'contains', tags, entityId } },
    ],
  };
}

async function createRule(): Promise<string> {
  const created = await client().tagRules.apply({
    changeSet: addOp(['contains:software']),
    acceptedNewTags: ['contains:software'],
  });
  return created.rules[0]?.id ?? '';
}

describe('POST /tag-rules/apply — write guards', () => {
  it.each(['flag:needs-review', 'person:x'])(
    'refuses an add op carrying %s with a 400 and creates no rule',
    async (marker) => {
      await expect(
        client().tagRules.apply({
          changeSet: addOp(['contains:software', marker]),
          acceptedNewTags: ['contains:software', marker],
        })
      ).rejects.toMatchObject({ status: 400 });

      expect((await client().tagRules.list()).data).toHaveLength(0);
    }
  );

  it('leaves no vocabulary row behind for a refused apply', async () => {
    await expect(
      client().tagRules.apply({
        changeSet: addOp(['contains:refused-with-marker', 'person:x']),
        acceptedNewTags: ['contains:refused-with-marker', 'person:x'],
      })
    ).rejects.toMatchObject({ status: 400 });

    const { tags } = await client().tagRules.vocabulary();
    expect(tags).not.toContain('contains:refused-with-marker');
    expect(tags).not.toContain('person:x');
  });

  it('refuses an edit op adding a marker tag, leaving the rule as it was', async () => {
    const id = await createRule();

    await expect(
      client().tagRules.apply({
        changeSet: { ops: [{ op: 'edit', id, data: { tags: ['flag:needs-review'] } }] },
        acceptedNewTags: ['flag:needs-review'],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect((await client().tagRules.get(id)).data.tags).toEqual(['contains:software']);
  });

  it('refuses an add op scoped to a temp: placeholder entity', async () => {
    await expect(
      client().tagRules.apply({
        changeSet: addOp(['contains:software'], 'temp:entity:0b8c1d2e'),
        acceptedNewTags: ['contains:software'],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect((await client().tagRules.list()).data).toHaveLength(0);
  });

  it('refuses an edit op re-scoping a rule to a temp: placeholder entity', async () => {
    const id = await createRule();

    await expect(
      client().tagRules.apply({
        changeSet: { ops: [{ op: 'edit', id, data: { entityId: 'temp:entity:0b8c1d2e' } }] },
        acceptedNewTags: [],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect((await client().tagRules.get(id)).data.entityId).toBeNull();
  });

  it('still applies a rule with no marker tag and a real scope', async () => {
    const applied = await client().tagRules.apply({
      changeSet: addOp(['contains:software', 'channel:online'], 'e2f1c3a0-real-contact'),
      acceptedNewTags: ['contains:software'],
    });

    expect(applied.rules).toHaveLength(1);
    expect(applied.rules[0]).toMatchObject({
      entityId: 'e2f1c3a0-real-contact',
      tags: ['contains:software', 'channel:online'],
    });
  });
});

describe('PATCH /tag-rules/:id — write guards', () => {
  it.each(['flag:needs-review', 'person:x'])(
    'refuses tags carrying %s with a 400',
    async (marker) => {
      const id = await createRule();

      await expect(
        client().tagRules.update(id, { tags: ['contains:software', marker] })
      ).rejects.toMatchObject({ status: 400 });

      expect((await client().tagRules.get(id)).data.tags).toEqual(['contains:software']);
    }
  );

  it('refuses a temp: placeholder scope with a 400', async () => {
    const id = await createRule();

    await expect(
      client().tagRules.update(id, { entityId: 'temp:entity:0b8c1d2e' })
    ).rejects.toMatchObject({ status: 400 });

    expect((await client().tagRules.get(id)).data.entityId).toBeNull();
  });

  it('still accepts a non-marker patch', async () => {
    const id = await createRule();

    const updated = await client().tagRules.update(id, { tags: ['contains:subscription'] });

    expect(updated.data.tags).toEqual(['contains:subscription']);
  });
});
