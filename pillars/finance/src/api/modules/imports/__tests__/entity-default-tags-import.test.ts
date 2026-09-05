/**
 * Integration coverage for the entity `venue:` default-tag backfill
 * (POPS-2609): a row that the matcher resolves to a merchant carrying
 * `defaultTags` must arrive at Tag Review with that tag attributed to the
 * entity — deterministically, with no AI call.
 *
 * The pipeline's own tests all pass an EMPTY `entityDefaultTags` map, so the
 * whole point of the backfill — that populating the contact is enough — was
 * asserted nowhere above the suggester.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  importsService,
  openFinanceDb,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { classifyWithoutAi } from '../process-transaction.js';
import { createAiCounters } from '../types.js';

import type { ContactEntity } from '../../../contacts/client.js';
import type { ParsedTransaction, ProcessContext } from '../types.js';

const { categorizeWithAi, isAiCategorizerEnabled } = vi.hoisted(() => ({
  categorizeWithAi: vi.fn(),
  isAiCategorizerEnabled: vi.fn(),
}));

vi.mock('../ai-categorizer.js', () => ({
  categorizeWithAi,
  isAiCategorizerEnabled,
  toCategorizerInput: (t: ParsedTransaction) => ({ description: t.description }),
}));

const STONEWALL_ID = '11111111-1111-4111-8111-111111111111';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

function contact(over: Partial<ContactEntity> & { id: string; name: string }): ContactEntity {
  return {
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function makeTransaction(description: string): ParsedTransaction {
  return {
    date: '2026-01-01',
    description,
    amount: -18.5,
    dialectAccountLabel: 'amex',
    rawRow: description,
    checksum: crypto.randomUUID(),
  };
}

/** Build the process context exactly as `process-service` does, from contacts. */
function makeContext(contacts: ContactEntity[]): ProcessContext {
  const maps = importsService.buildEntityMaps(contacts);
  return {
    entityLookup: maps.entityLookup,
    aliases: maps.aliasMap,
    knownTags: [],
    importBatchId: 'batch-1',
    entityDefaultTags: importsService.buildDefaultTagsByEntity(contacts),
    correctionRules: [],
  };
}

beforeEach(() => {
  isAiCategorizerEnabled.mockReturnValue(true);
  categorizeWithAi.mockResolvedValue({ entityName: null, category: null, confidence: 0 });
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-entity-default-import-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('import classification — entity default tags (POPS-2609)', () => {
  it("carries a matched merchant's venue default through as source 'entity', with no AI call", () => {
    const context = makeContext([
      contact({ id: STONEWALL_ID, name: 'Stonewall Hotel', defaultTags: ['venue:bar'] }),
    ]);

    const outcome = classifyWithoutAi({
      db,
      transaction: makeTransaction('Stonewall Hotel'),
      context,
      counters: createAiCounters(),
    });

    expect(outcome.kind).toBe('resolved');
    const processed = outcome.kind === 'resolved' ? outcome.result.matched : undefined;
    expect(processed?.entity?.entityId).toBe(STONEWALL_ID);
    expect(processed?.suggestedTags).toEqual([{ tag: 'venue:bar', source: 'entity' }]);
    expect(categorizeWithAi).not.toHaveBeenCalled();
  });

  it('suggests nothing for the same merchant while its contact has no defaults (pre-backfill)', () => {
    const context = makeContext([contact({ id: STONEWALL_ID, name: 'Stonewall Hotel' })]);

    const outcome = classifyWithoutAi({
      db,
      transaction: makeTransaction('Stonewall Hotel'),
      context,
      counters: createAiCounters(),
    });

    const processed = outcome.kind === 'resolved' ? outcome.result.matched : undefined;
    expect(processed?.entity?.entityId).toBe(STONEWALL_ID);
    expect(processed?.suggestedTags).toEqual([]);
  });

  it('does not leak one merchant’s defaults onto another', () => {
    const context = makeContext([
      contact({ id: STONEWALL_ID, name: 'Stonewall Hotel', defaultTags: ['venue:bar'] }),
      contact({ id: 'entity-harris', name: 'Harris Farm Markets' }),
    ]);

    const outcome = classifyWithoutAi({
      db,
      transaction: makeTransaction('Harris Farm Markets'),
      context,
      counters: createAiCounters(),
    });

    const processed = outcome.kind === 'resolved' ? outcome.result.matched : undefined;
    expect(processed?.entity?.entityId).toBe('entity-harris');
    expect(processed?.suggestedTags).toEqual([]);
  });
});
