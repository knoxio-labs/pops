import { beforeEach, describe, expect, it } from 'vitest';

import { suggestNextCode } from '../item-code.js';
import { mutation, openHarness, seedItem, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedItem(h, { id: 'lamp' });
  seedItem(h, { id: 'toaster' });
});

describe('item.setCode', () => {
  it('sets a code and records a code_set event', () => {
    const outcome = h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('lamp').code).toBe('B412');
    expect(h.eventsFor('lamp')[0]?.kind).toBe('code_set');
  });

  it('clears a code', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    h.run(mutation('item.setCode', 'lamp', { code: null }, { baseRevision: 2 }));
    expect(h.item('lamp').code).toBeNull();
  });

  it('is a conflict, case-insensitively, and never rewrites the stored code', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'b412' }));
    expect(outcome).toMatchObject({
      status: 'conflict',
      kind: 'code_collision',
      heldBy: { id: 'lamp', name: 'lamp' },
    });
    expect(h.item('toaster').code).toBeNull();
    expect(h.item('lamp').code).toBe('B412');
  });

  it('suggests the next free code keeping the stem', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'B412' }));
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: 'B413' });
  });

  it('skips a held candidate when suggesting the next free code', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    h.run(mutation('item.setCode', 'toaster', { code: 'B413' }, { baseRevision: 1 }));
    seedItem(h, { id: 'kettle' });
    const outcome = h.run(mutation('item.setCode', 'kettle', { code: 'B412' }));
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: 'B414' });
  });

  it('has no suggestion when the code has no trailing digits', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'LAMP' }));
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'LAMP' }));
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: null });
  });

  it('is still a conflict when the code is held by a tombstoned item', () => {
    seedItem(h, { id: 'deleted-lamp', code: 'B412', deletedAt: '2026-09-18T01:00:00.000Z' });
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'B412' }));
    expect(outcome).toMatchObject({
      status: 'conflict',
      kind: 'code_collision',
      heldBy: { id: 'deleted-lamp', name: 'deleted-lamp' },
    });
    expect(h.item('toaster').code).toBeNull();
  });

  it('suggests around a code held by a tombstoned item', () => {
    seedItem(h, { id: 'deleted-lamp', code: 'B412', deletedAt: '2026-09-18T01:00:00.000Z' });
    const outcome = h.run(mutation('item.setCode', 'toaster', { code: 'B412' }));
    expect(outcome).toMatchObject({ status: 'conflict', suggestedCode: 'B413' });
  });

  it('restoring a deleted item keeps its code reserved against everyone else', () => {
    h.run(mutation('item.setCode', 'lamp', { code: 'B412' }));
    seedItem(h, { id: 'deleted-toaster' });
    h.raw
      .prepare('UPDATE items SET deleted_at = ? WHERE id = ?')
      .run('2026-09-18T01:00:00.000Z', 'lamp');
    const collision = h.run(mutation('item.setCode', 'toaster', { code: 'B412' }));
    expect(collision).toMatchObject({ status: 'conflict', kind: 'code_collision' });

    const restored = h.run(mutation('item.restoreDeleted', 'lamp', {}, { baseRevision: 1 }));
    expect(restored).toMatchObject({ status: 'applied' });
    expect(h.item('lamp').code).toBe('B412');
    expect(h.item('lamp').deletedAt).toBeNull();
  });
});

describe('suggestNextCode', () => {
  it('returns null for a code with no trailing digits', () => {
    const h2 = openHarness();
    expect(suggestNextCode(h2.db, 'NOCODE', 'x')).toBeNull();
  });
});
