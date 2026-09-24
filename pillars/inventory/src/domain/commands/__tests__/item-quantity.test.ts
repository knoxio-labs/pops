import { beforeEach, describe, expect, it } from 'vitest';

import { mutation, openHarness, seedItem, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedItem(h, { id: 'screws' });
  seedItem(h, { id: 'crate', isContainer: true });
});

describe('item.setQuantity', () => {
  it('renumbers the group and records a quantity_changed event', () => {
    const outcome = h.run(mutation('item.setQuantity', 'screws', { quantity: 40 }));
    expect(outcome).toMatchObject({ status: 'applied', revision: 2 });
    expect(h.item('screws').quantity).toBe(40);
    expect(h.eventsFor('screws')[0]?.kind).toBe('quantity_changed');
  });

  it('rejects a quantity below one', () => {
    const outcome = h.run(mutation('item.setQuantity', 'screws', { quantity: 0 }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('converges when two devices set the same new count', () => {
    h.run(mutation('item.setQuantity', 'screws', { quantity: 40 }));
    const outcome = h.run(
      mutation('item.setQuantity', 'screws', { quantity: 40 }, { baseRevision: 1 })
    );
    expect(outcome).toMatchObject({ status: 'applied', converged: true });
  });

  it('conflicts when two devices set different new counts', () => {
    h.run(mutation('item.setQuantity', 'screws', { quantity: 40 }));
    const outcome = h.run(
      mutation('item.setQuantity', 'screws', { quantity: 30 }, { baseRevision: 1 })
    );
    expect(outcome).toMatchObject({ status: 'conflict', kind: 'field', field: 'quantity' });
  });

  it('rejects raising a container above quantity 1 (ADR-002 D3)', () => {
    const outcome = h.run(mutation('item.setQuantity', 'crate', { quantity: 2 }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'quantity_container_conflict' });
    expect(h.item('crate').quantity).toBe(1);
  });

  it('leaves a container at quantity 1 unchanged', () => {
    const outcome = h.run(mutation('item.setQuantity', 'crate', { quantity: 1 }));
    expect(outcome).toMatchObject({ status: 'applied' });
  });
});
