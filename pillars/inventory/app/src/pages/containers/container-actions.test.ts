import { describe, expect, it, vi } from 'vitest';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { coreWorld } from '../../foundation/test-fixtures/core.js';
import { containerActions } from './container-actions.js';
import { containerTypeKey } from './containers-model.js';

import type { SelectionBarAction } from '../../foundation/model/contracts.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

function typeOption(
  key: string,
  sortOrder: number,
  options: Partial<Pick<CatalogueType, 'archivedAt' | 'capabilities' | 'parentTypeId'>> = {}
): CatalogueType {
  return {
    id: key,
    key,
    label: key,
    sortOrder,
    archivedAt: options.archivedAt ?? null,
    capabilities: options.capabilities ?? [],
    description: null,
    fields: [],
    legacyLabels: [],
    parentTypeId: options.parentTypeId ?? null,
    presentation: {},
    replacedBy: null,
    revision: 1,
  };
}

function itemActions(): SelectionBarAction[] {
  return [
    { id: 'pick-up', label: 'Pick up', icon: INVENTORY_ICONS.pickUp },
    { id: 'move', label: 'Move', icon: INVENTORY_ICONS.move },
    { id: 'take-out', label: 'Take out', icon: INVENTORY_ICONS.takeOut },
    { id: 'set-field', label: 'Set field', icon: INVENTORY_ICONS.type },
    { id: 'retire', label: 'Retire', icon: INVENTORY_ICONS.retired },
  ];
}

describe('containerActions', () => {
  it('inserts Close third and moves Set field under More', () => {
    const onAccess = vi.fn();

    const actions = containerActions(coreWorld, ['box-k13'], itemActions(), onAccess);

    expect(actions.map((action) => action.id)).toEqual([
      'pick-up',
      'move',
      'close',
      'take-out',
      'set-field',
      'retire',
    ]);
    expect(actions.find((action) => action.id === 'set-field')).toMatchObject({ overflow: true });
    actions.find((action) => action.id === 'close')?.onSelect?.();
    expect(onAccess).toHaveBeenCalledWith('closed');
  });

  it('offers Open when every selected container is closed', () => {
    const onAccess = vi.fn();

    const actions = containerActions(coreWorld, ['box-k12', 'box-o04'], itemActions(), onAccess);

    expect(actions[2]?.id).toBe('open');
    actions[2]?.onSelect?.();
    expect(onAccess).toHaveBeenCalledWith('open');
  });
});

describe('containerTypeKey', () => {
  it('chooses the first active containment type by sort order', () => {
    expect(
      containerTypeKey([
        typeOption('archived-box', -1, {
          archivedAt: '2026-01-01T00:00:00.000Z',
          capabilities: ['containment'],
        }),
        typeOption('storage-tub', 4, { capabilities: ['containment'] }),
        typeOption('moving-box', 2, { capabilities: ['containment'] }),
        typeOption('cable', 1),
      ])
    ).toBe('moving-box');
  });

  it('returns null when the published catalogue has no containment type', () => {
    expect(containerTypeKey([typeOption('cable', 1)])).toBeNull();
  });

  it('inherits containment from a parent type', () => {
    expect(
      containerTypeKey([
        typeOption('storage', 2, { capabilities: ['containment'] }),
        typeOption('moving-box', 1, { parentTypeId: 'storage' }),
      ])
    ).toBe('moving-box');
  });
});
