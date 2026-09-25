import { box, coreInventory, coreLocations, coreWorld, at } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { buildWorld } from '../shared/placement-model';
import {
  carriedLine,
  storeButtonLabel,
  storeCandidates,
  storePlan,
  targetNotice,
} from './store-here-model';

import type { StoreHereTarget } from '../shared/contracts';

const kitchen13: StoreHereTarget = { kind: 'container', id: 'box-k13', name: 'Kitchen 13' };
const partsCase: StoreHereTarget = { kind: 'container', id: 'box-parts', name: 'Small parts case' };
const desk: StoreHereTarget = { kind: 'location', id: 'loc-desk', name: 'Desk' };

function candidate(target: StoreHereTarget, id: string, query = '') {
  return storeCandidates(coreWorld, target, query).find((entry) => entry.item.id === id);
}

describe('storeCandidates', () => {
  it('lists what is in hand first when nothing is typed', () => {
    const first = storeCandidates(coreWorld, kitchen13, '').slice(0, 5);
    expect(first.every((entry) => entry.item.placement.kind === 'in-hand')).toBe(true);
  });

  it('never lists the target itself or anything inactive', () => {
    const ids = storeCandidates(coreWorld, kitchen13, '').map((entry) => entry.item.id);
    expect(ids).not.toContain('box-k13');
    expect(ids).not.toContain('itm-camera');
    expect(ids).not.toContain('itm-speaker');
    expect(ids).not.toContain('box-shoe');
  });

  it('marks what is already there, in the move plan’s words', () => {
    expect(candidate(kitchen13, 'itm-kettle')?.refusal).toBe('Already in Kitchen 13.');
    expect(candidate(desk, 'itm-lamp')?.refusal).toBe('Already in Desk.');
  });

  it('refuses a container that holds the target', () => {
    expect(candidate(partsCase, 'box-cables')?.refusal).toBe(
      'Small parts case is inside Cable tub.'
    );
  });

  it('allows an ordinary item from elsewhere', () => {
    expect(candidate(kitchen13, 'itm-toaster')?.refusal).toBeNull();
  });

  it('ranks a name prefix above a code or place match', () => {
    const results = storeCandidates(coreWorld, kitchen13, 'kitchen').map(
      (entry) => entry.item.name
    );
    expect(results[0]).toBe('Kitchen 12');
    expect(results).toContain('Toaster');
    expect(storeCandidates(coreWorld, kitchen13, 'zzz')).toEqual([]);
  });

  it('matches a code', () => {
    const results = storeCandidates(coreWorld, kitchen13, 'M27').map((entry) => entry.item.id);
    expect(results).toEqual(['itm-monitor']);
  });
});

describe('storePlan and its copy', () => {
  it('counts what moves and what rides along inside a container', () => {
    const plan = storePlan(coreWorld, desk, ['box-cables', 'itm-toaster', 'itm-lamp']);
    expect(storeButtonLabel(plan)).toBe('Store 2 items');
    expect(carriedLine(plan)).toBe('Their contents move too: 3 more items.');
  });

  it('says nothing about contents when no container moves', () => {
    const plan = storePlan(coreWorld, desk, ['itm-toaster']);
    expect(storeButtonLabel(plan)).toBe('Store 1 item');
    expect(carriedLine(plan)).toBeNull();
  });

  it('falls back to a plain label when nothing would move', () => {
    expect(storeButtonLabel(storePlan(coreWorld, desk, ['itm-lamp']))).toBe('Store here');
  });
});

describe('targetNotice', () => {
  it('refuses a closed container', () => {
    const closed: StoreHereTarget = { kind: 'container', id: 'box-o04', name: 'Office 04' };
    expect(targetNotice(coreWorld, closed)).toEqual({
      tone: 'refuse',
      text: 'Office 04 is closed. Open it first.',
    });
  });

  it('warns, without refusing, about an open container marked full', () => {
    const fullOpen = box(['box-full', 'Linen 02', 'type-box'], at('loc-hall'), 'open', {
      full: true,
    });
    const world = buildWorld([...coreInventory, fullOpen], coreLocations);
    const target: StoreHereTarget = { kind: 'container', id: 'box-full', name: 'Linen 02' };
    expect(targetNotice(world, target)).toEqual({
      tone: 'warn',
      text: 'Linen 02 is marked full. Storing more keeps the mark.',
    });
  });

  it('has nothing to say about an open container or a place', () => {
    expect(targetNotice(coreWorld, kitchen13)).toBeNull();
    expect(targetNotice(coreWorld, desk)).toBeNull();
  });
});
