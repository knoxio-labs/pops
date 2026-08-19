/**
 * The proposal pass, against a real database and a fake model.
 *
 * The sweep-safety property is the one this design fails on if it fails at
 * all: a re-run must never touch a row a human has decided. Everything else
 * here is about the pass staying honest when the model is unhelpful —
 * declining, going quiet, or answering nonsense must all leave the column
 * NULL rather than filled with something plausible.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { confirmItemClassification, createPurchase, getPurchase } from '../../db/index.js';
import { proposeItemKinds } from '../propose-item-kind.js';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { ProposalCandidate } from '../batch.js';
import type { ItemKindProposer } from '../propose-item-kind.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

interface Recorded {
  readonly batches: (readonly ProposalCandidate[])[];
}

/** A model that answers every candidate with one kind. */
function alwaysAnswers(kind: string): ItemKindProposer & Recorded {
  const batches: (readonly ProposalCandidate[])[] = [];
  return {
    batches,
    propose: async (candidates) => {
      batches.push(candidates);
      return JSON.stringify({
        proposals: candidates.map((_, index) => ({ id: index + 1, kind })),
      });
    },
  };
}

/** A model that answers by product name, and declines the rest. */
function answersByName(byName: Readonly<Record<string, string>>): ItemKindProposer {
  return {
    propose: async (candidates) =>
      JSON.stringify({
        proposals: candidates.map((candidate, index) => ({
          id: index + 1,
          kind: byName[candidate.name] ?? 'unknown',
        })),
      }),
  };
}

function seedLines(
  items: readonly { name: string; sku?: string | null; cents?: number }[],
  overrides: Parameters<typeof amazonOrder>[0] = {}
): string {
  return createPurchase(
    opened.db,
    amazonOrder({
      items: items.map((item) => ({
        name: item.name,
        sku:
          item.sku === undefined || item.sku === null ? null : { value: item.sku, scheme: 'asin' },
        unitPriceCents: item.cents ?? 1000,
        lineTotalCents: item.cents ?? 1000,
      })),
      ...overrides,
    })
  );
}

function kindsOf(purchaseId: string): (string | null)[] {
  return (getPurchase(opened.db, purchaseId)?.items ?? []).map((entry) => entry.item.kind);
}

describe('what the pass writes', () => {
  it('fills every unclassified line and leaves the confirmation marker unset', () => {
    // A proposal is not a decision, so nothing here may set the marker —
    // that is the entire distinction the two columns carry.
    const id = seedLines([{ name: 'Robot vacuum' }, { name: 'Air fryer' }]);
    return proposeItemKinds(opened.db, alwaysAnswers('durable')).then(() => {
      const items = getPurchase(opened.db, id)?.items ?? [];
      expect(items.map((entry) => entry.item.kind)).toEqual(['durable', 'durable']);
      for (const entry of items) expect(entry.item.kindConfirmedAt).toBeNull();
    });
  });

  it('writes one answer to every line sharing a product', async () => {
    const id = seedLines([
      { name: 'AA batteries 24pk', sku: 'B0AA' },
      { name: 'AA batteries', sku: 'B0AA' },
      { name: 'Robot vacuum', sku: 'B0ROBOT' },
    ]);
    const proposer = alwaysAnswers('consumable');
    const outcome = await proposeItemKinds(opened.db, proposer);

    // Two products, three lines: the sku is what collapsed the first two.
    expect(outcome.candidates).toBe(2);
    expect(outcome.linesWritten).toBe(3);
    expect(kindsOf(id)).toEqual(['consumable', 'consumable', 'consumable']);
  });

  it('leaves a declined product NULL and counts it as undecided', async () => {
    const id = seedLines([{ name: 'Robot vacuum' }, { name: 'Gift card' }]);
    const outcome = await proposeItemKinds(opened.db, answersByName({ 'Robot vacuum': 'durable' }));

    expect(kindsOf(id)).toEqual(['durable', null]);
    expect(outcome).toMatchObject({ candidates: 2, decided: 1, undecided: 1 });
  });
});

describe('what the pass must never touch', () => {
  it('leaves a confirmed line exactly as the human left it', async () => {
    const id = seedLines([{ name: 'Robot vacuum' }, { name: 'AA batteries' }]);
    const items = getPurchase(opened.db, id)?.items ?? [];
    const confirmed = items[0]?.item.id;
    if (confirmed === undefined) throw new Error('no line to confirm');
    confirmItemClassification(opened.db, id, confirmed, { kind: 'durable' });
    const marker = getPurchase(opened.db, id)?.items[0]?.item.kindConfirmedAt;

    const outcome = await proposeItemKinds(opened.db, alwaysAnswers('consumable'));

    const after = getPurchase(opened.db, id)?.items ?? [];
    expect(after[0]?.item.kind).toBe('durable');
    expect(after[0]?.item.kindConfirmedAt).toBe(marker);
    // And it was never even a candidate: the read predicate excludes it, so
    // no tokens are spent re-deciding what is already decided.
    expect(outcome.candidates).toBe(1);
    expect(after[1]?.item.kind).toBe('consumable');
  });

  it('leaves a source-stated kind alone, because that is a transcription', async () => {
    // A kind an adapter read off its source lands asserted. Overwriting it
    // with a model's opinion would replace evidence with inference.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        items: [
          {
            name: 'Kindle ebook',
            unitPriceCents: 1000,
            lineTotalCents: 1000,
            kind: 'digital',
          },
        ],
      })
    );
    const outcome = await proposeItemKinds(opened.db, alwaysAnswers('durable'));
    expect(outcome.candidates).toBe(0);
    expect(kindsOf(id)).toEqual(['digital']);
  });

  it('never overwrites its own earlier proposal on a re-run', async () => {
    // Idempotence, and the reason re-proposing is a separate deliberate
    // step: a pass that could overwrite an existing kind is one bug away
    // from overwriting a confirmed one.
    const id = seedLines([{ name: 'Robot vacuum' }]);
    await proposeItemKinds(opened.db, alwaysAnswers('durable'));

    const second = await proposeItemKinds(opened.db, alwaysAnswers('consumable'));
    expect(second.candidates).toBe(0);
    expect(kindsOf(id)).toEqual(['durable']);
  });

  it('picks up what a cleared proposal left behind', async () => {
    // The documented way to re-propose after a better model. It selects on
    // the marker, so it cannot reach a decision.
    const id = seedLines([{ name: 'Robot vacuum' }]);
    await proposeItemKinds(opened.db, alwaysAnswers('consumable'));
    opened.raw
      .prepare(`UPDATE purchase_items SET kind = NULL WHERE kind_confirmed_at IS NULL`)
      .run();

    await proposeItemKinds(opened.db, alwaysAnswers('durable'));
    expect(kindsOf(id)).toEqual(['durable']);
  });
});

describe('when the model is unhelpful', () => {
  it('leaves the batch NULL when the answer cannot be read', async () => {
    const id = seedLines([{ name: 'Robot vacuum' }]);
    const outcome = await proposeItemKinds(opened.db, {
      propose: async () => 'I am afraid I cannot do that.',
    });
    expect(kindsOf(id)).toEqual([null]);
    expect(outcome).toMatchObject({ unreadableBatches: 1, decided: 0, undecided: 1 });
  });

  it('leaves the batch NULL when the model returns nothing at all', async () => {
    const id = seedLines([{ name: 'Robot vacuum' }]);
    const outcome = await proposeItemKinds(opened.db, { propose: async () => null });
    expect(kindsOf(id)).toEqual([null]);
    expect(outcome.unreadableBatches).toBe(1);
  });

  it('carries on past one unreadable batch', async () => {
    // One bad answer must not sink a run over a year of history: those
    // lines stay where they started and the next run retries them.
    const id = seedLines([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
    let call = 0;
    const outcome = await proposeItemKinds(
      opened.db,
      {
        propose: async (candidates) => {
          call += 1;
          if (call === 1) return 'nonsense';
          return JSON.stringify({
            proposals: candidates.map((_, index) => ({ id: index + 1, kind: 'consumable' })),
          });
        },
      },
      { batchSize: 2 }
    );

    expect(outcome).toMatchObject({ batches: 2, unreadableBatches: 1, decided: 2 });
    expect(kindsOf(id).filter((kind) => kind === 'consumable')).toHaveLength(2);
  });
});

describe('batching and resumability', () => {
  it('splits candidates into batches of the requested size', async () => {
    seedLines([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }]);
    const proposer = alwaysAnswers('consumable');
    await proposeItemKinds(opened.db, proposer, { batchSize: 2 });
    expect(proposer.batches.map((batch) => batch.length)).toEqual([2, 2, 1]);
  });

  it('spends a capped run on the most expensive lines first', async () => {
    // Spend is concentrated, so a run that stops early has still bought
    // most of the answer — but only if it started at the top.
    const id = seedLines([
      { name: 'Cable tie 10pk', cents: 300 },
      { name: 'Robot vacuum', cents: 79900 },
      { name: 'Phone charger', cents: 2500 },
    ]);
    await proposeItemKinds(opened.db, alwaysAnswers('durable'), { limit: 1 });

    const byName = new Map(
      (getPurchase(opened.db, id)?.items ?? []).map((entry) => [entry.item.name, entry.item.kind])
    );
    expect(byName.get('Robot vacuum')).toBe('durable');
    expect(byName.get('Cable tie 10pk')).toBeNull();
    expect(byName.get('Phone charger')).toBeNull();
  });

  it('reports progress per batch so a long run is watchable', async () => {
    seedLines([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    const seen: [number, number][] = [];
    await proposeItemKinds(opened.db, alwaysAnswers('consumable'), {
      batchSize: 2,
      onBatch: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('does nothing, and asks nothing, when every line is classified', async () => {
    const proposer = alwaysAnswers('durable');
    const outcome = await proposeItemKinds(opened.db, proposer);
    expect(outcome).toMatchObject({ candidates: 0, batches: 0, linesWritten: 0 });
    expect(proposer.batches).toEqual([]);
  });
});
