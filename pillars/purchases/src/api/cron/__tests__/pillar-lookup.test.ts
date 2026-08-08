/**
 * The transport adapters' fold from SDK {@link CallResult} discriminants to
 * the cron's four outcomes.
 *
 * Worth its own file because this mapping is where a wrong answer becomes a
 * wrong write: `not-found` is the ONLY discriminant licensed to stamp
 * `staleAt`, and anything read as `not-found` by mistake marks a live
 * reference dead. The SDK proxy is mocked — this is about the mapping, not
 * the network.
 */
import { describe, expect, it, vi } from 'vitest';

import type { CallResult } from '@pops/pillar-sdk/client';

const itemsGet = vi.fn<(input: { id: string }) => Promise<CallResult<unknown>>>();
const paperlessGet = vi.fn<(input: { id: string }) => Promise<CallResult<unknown>>>();

vi.mock('@pops/pillar-sdk/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pops/pillar-sdk/client')>();
  return {
    ...actual,
    pillar: (id: string): unknown =>
      id === 'inventory' ? { items: { get: itemsGet } } : { paperless: { get: paperlessGet } },
  };
});

const { createDocumentLookup, createInventoryItemLookup } = await import('../pillar-lookup.js');

const CASES: readonly [string, CallResult<unknown>, unknown][] = [
  ['ok', { kind: 'ok', value: { data: {} } }, { kind: 'ok' }],
  ['not-found', { kind: 'not-found', pillar: 'p' }, { kind: 'not-found' }],
  [
    'bad-request',
    { kind: 'bad-request', pillar: 'p', message: 'id must be an integer' },
    { kind: 'bad-uri', reason: 'id must be an integer' },
  ],
  [
    'unavailable',
    { kind: 'unavailable', pillar: 'p' },
    { kind: 'unavailable', reason: 'unavailable' },
  ],
  [
    'degraded',
    { kind: 'degraded', pillar: 'p', reason: 'reconciling' },
    { kind: 'unavailable', reason: 'degraded' },
  ],
  [
    'unauthorized',
    { kind: 'unauthorized', pillar: 'p' },
    { kind: 'unavailable', reason: 'unauthorized' },
  ],
  ['conflict', { kind: 'conflict', pillar: 'p' }, { kind: 'unavailable', reason: 'conflict' }],
  [
    'contract-mismatch',
    { kind: 'contract-mismatch', pillar: 'p', expected: 'items.get' },
    { kind: 'unavailable', reason: 'contract-mismatch' },
  ],
];

describe('createInventoryItemLookup', () => {
  it.each(CASES)('folds %s', async (_label, result, expected) => {
    itemsGet.mockResolvedValue(result);

    await expect(createInventoryItemLookup()('item-1')).resolves.toEqual(expected);
  });

  it('addresses the item by the parsed id', async () => {
    itemsGet.mockResolvedValue({ kind: 'ok', value: {} });

    await createInventoryItemLookup()('item-1');

    expect(itemsGet).toHaveBeenCalledWith({ id: 'item-1' });
  });

  it('falls back to a generic reason when bad-request carries no message', async () => {
    itemsGet.mockResolvedValue({ kind: 'bad-request', pillar: 'inventory' });

    await expect(createInventoryItemLookup()('item-1')).resolves.toEqual({
      kind: 'bad-uri',
      reason: 'bad-request',
    });
  });
});

describe('createDocumentLookup', () => {
  it.each(CASES)('folds %s', async (_label, result, expected) => {
    paperlessGet.mockResolvedValue(result);

    await expect(createDocumentLookup()('42')).resolves.toEqual(expected);
  });

  it('addresses the document by the parsed id', async () => {
    paperlessGet.mockResolvedValue({ kind: 'ok', value: {} });

    await createDocumentLookup()('42');

    expect(paperlessGet).toHaveBeenCalledWith({ id: '42' });
  });

  /**
   * Paperless is not configured, so the documents pillar answers 412 →
   * `unavailable`. It must NOT read as the document being gone: an operator
   * who has not wired Paperless yet would otherwise find every attached tax
   * invoice marked stale on the first nightly tick.
   */
  it('never reads an unconfigured Paperless as a missing document', async () => {
    paperlessGet.mockResolvedValue({ kind: 'unavailable', pillar: 'documents' });

    await expect(createDocumentLookup()('42')).resolves.not.toMatchObject({ kind: 'not-found' });
  });
});
