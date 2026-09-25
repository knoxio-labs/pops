import { coreItem, coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { OFFLINE_REASON } from '../foundation';
import { detailVerbs } from './detail-verbs';

import type { ItemRowModel } from '../foundation';

const verbsOf = (id: string, offline = false) => detailVerbs(coreItem(id), coreWorld, { offline });
const menuIds = (id: string) => verbsOf(id).menu.flatMap((group) => group.map((entry) => entry.id));

describe('detailVerbs placement', () => {
  it('offers Pick up then Move for an item in a place', () => {
    const verbs = verbsOf('itm-drill');
    expect(verbs.primary?.id).toBe('pick-up');
    expect(verbs.secondary.map((verb) => verb.id)).toEqual(['move']);
  });

  it('offers Put back to the remembered place for an item in hand', () => {
    const verbs = verbsOf('itm-tape');
    expect(verbs.primary).toMatchObject({ id: 'put-back', detail: 'To Red toolbox' });
  });

  it('names a remembered container as the put back target', () => {
    expect(verbsOf('itm-screw').primary?.detail).toBe('To Cable tub');
  });

  it('falls back to Move when the previous place was deleted or never known', () => {
    expect(verbsOf('itm-headphones').primary?.id).toBe('move');
    expect(verbsOf('itm-torch').primary?.id).toBe('move');
    expect(verbsOf('itm-torch').secondary).toEqual([]);
  });
});

describe('detailVerbs containers', () => {
  it('leads an open container with Store here, then Close', () => {
    const verbs = verbsOf('box-k13');
    expect(verbs.primary?.id).toBe('store-here');
    expect(verbs.primary?.disabledReason).toBeUndefined();
    expect(verbs.secondary.map((verb) => verb.id)).toEqual(['close', 'pick-up', 'move']);
  });

  it('keeps Store here visible but refused on a closed container, and offers Open', () => {
    const verbs = verbsOf('box-o04');
    expect(verbs.primary?.disabledReason).toBe('Office 04 is closed. Open it to store things.');
    expect(verbs.secondary[0]?.id).toBe('open');
  });

  it('warns rather than refuses on an open container marked full', () => {
    const full: ItemRowModel = {
      ...coreItem('box-k13'),
      container: { access: 'open', full: true },
    };
    const verbs = detailVerbs(full, coreWorld);
    expect(verbs.primary?.disabledReason).toBeUndefined();
    expect(verbs.primary?.detail).toBe('Marked full. You can still store here.');
  });

  it('offers Mark full or Not full, never Split, on a container', () => {
    expect(menuIds('box-k13')).toContain('toggle-full');
    expect(menuIds('box-k13')).not.toContain('split');
    const fullMenu = verbsOf('box-k12').menu.flat();
    expect(fullMenu.find((entry) => entry.id === 'toggle-full')?.label).toBe('Not full any more');
  });
});

describe('detailVerbs quantity and code', () => {
  it('offers Split and Change quantity only to a group', () => {
    expect(menuIds('itm-hdmi')).toEqual(expect.arrayContaining(['split', 'change-quantity']));
    expect(menuIds('itm-drill')).not.toContain('split');
  });

  it('keeps Copy code visible but refused without a code', () => {
    const copy = verbsOf('itm-lamp')
      .menu.flat()
      .find((entry) => entry.id === 'copy-code');
    expect(copy?.disabledReason).toBe('No code yet. Edit the item to add one.');
    const coded = verbsOf('itm-drill')
      .menu.flat()
      .find((entry) => entry.id === 'copy-code');
    expect(coded?.disabledReason).toBeUndefined();
  });
});

describe('detailVerbs lifecycle', () => {
  it('ends the active menu with Destroy, the only destructive entry', () => {
    const last = verbsOf('itm-drill').menu.at(-1);
    expect(last?.map((entry) => entry.id)).toEqual(['retire', 'lost', 'discard', 'destroy']);
    expect(
      verbsOf('itm-drill')
        .menu.flat()
        .filter((entry) => entry.destructive)
    ).toHaveLength(1);
  });

  it('leads an inactive item with Restore and drops placement verbs', () => {
    const discarded = verbsOf('itm-speaker');
    expect(discarded.primary?.id).toBe('restore');
    expect(discarded.secondary).toEqual([]);
    expect(menuIds('itm-speaker')).not.toContain('split');
    expect(verbsOf('itm-umbrella').primary?.label).toBe('Found it');
  });

  it('leaves a destroyed item nothing but copying and history', () => {
    const verbs = verbsOf('itm-phone');
    expect(verbs.primary).toBeNull();
    expect(verbs.edit).toBeNull();
    expect(menuIds('itm-phone')).toEqual(['copy-code', 'copy-link', 'history']);
  });
});

describe('detailVerbs offline', () => {
  it('refuses every mutation with the offline reason but keeps read-only entries', () => {
    const verbs = verbsOf('box-k13', true);
    expect(verbs.primary?.disabledReason).toBe(OFFLINE_REASON);
    expect(verbs.edit?.disabledReason).toBe(OFFLINE_REASON);
    expect(verbs.secondary.every((verb) => verb.disabledReason === OFFLINE_REASON)).toBe(true);
    const menu = verbs.menu.flat();
    expect(menu.find((entry) => entry.id === 'copy-link')?.disabledReason).toBeUndefined();
    expect(menu.find((entry) => entry.id === 'retire')?.disabledReason).toBe(OFFLINE_REASON);
  });

  it('keeps a more specific refusal rather than overwriting it', () => {
    expect(verbsOf('box-o04', true).primary?.disabledReason).toBe(
      'Office 04 is closed. Open it to store things.'
    );
  });
});
