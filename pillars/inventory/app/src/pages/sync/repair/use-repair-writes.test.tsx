import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  archivedCase,
  DESIGN_NOW,
  referenceGoneCase,
  typeReplacedCase,
  placementCase,
} from '../../../foundation/test-fixtures/sync.js';
import { createTestQueryClient } from '../../../inventory-web/test-utils.js';
import { useRepairWrites } from './use-repair-writes.js';

import type { PropsWithChildren } from 'react';

import type { RepairCase } from '../sync-model.js';
import type { WebAction } from './repair-plan.js';

const mocks = vi.hoisted(() => ({
  changeType: vi.fn(),
  edit: vi.fn(),
  editValues: vi.fn(),
  move: vi.fn(),
  pickUp: vi.fn(),
  revert: vi.fn(),
  sendInventoryMutation: vi.fn(),
  showUndoToast: vi.fn(),
  useItemVerbs: vi.fn(),
  useRevertEvent: vi.fn(),
}));

vi.mock('../../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));
vi.mock('../../../inventory-web/item-verbs.js', () => ({ useItemVerbs: mocks.useItemVerbs }));
vi.mock('../../../inventory-web/mutation-client.js', () => ({
  sendInventoryMutation: mocks.sendInventoryMutation,
}));
vi.mock('../../../inventory-web/useRevertEvent.js', () => ({
  useRevertEvent: mocks.useRevertEvent,
}));

function applied() {
  return { status: 'applied' as const, seq: 1, undo: null };
}

function action(id: WebAction['id']): WebAction {
  return { id, label: id };
}

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

function placementRepair(): RepairCase {
  return {
    ...placementCase,
    mine: {
      value: 'Office 04',
      source: 'iPhone',
      at: DESIGN_NOW,
      target: { kind: 'location', locationId: 'location-office' },
    },
  };
}

function archivedRepair(): RepairCase {
  return {
    ...archivedCase,
    held: {
      title: 'Held edit',
      values: [
        {
          field: 'Length',
          value: '2 m',
          fit: 'fits',
          fieldId: 'field-length',
          values: ['2 m'],
        },
      ],
    },
  };
}

function typeReplacementRepair(): RepairCase {
  return {
    ...typeReplacedCase,
    held: {
      title: 'Held edit',
      values: [
        {
          field: 'Type',
          value: 'Network',
          fit: 'replaced',
          replacementTypeId: 'type-router',
        },
        {
          field: 'Wi-Fi standard',
          value: '802.11ax',
          fit: 'fits',
          fieldId: 'field-wifi',
          values: ['802.11ax'],
        },
      ],
    },
  };
}

function referenceRepair(): RepairCase {
  return {
    ...referenceGoneCase,
    held: {
      title: 'Held edit',
      values: [
        {
          field: 'Connected item',
          value: 'Desk lamp',
          fit: 'record-gone',
          fieldId: 'field-connected-item',
          recordId: 'item-desk-lamp',
          recordKind: 'item',
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const verb of [mocks.changeType, mocks.edit, mocks.editValues, mocks.move, mocks.pickUp]) {
    verb.mockResolvedValue(applied());
  }
  mocks.sendInventoryMutation.mockResolvedValue(applied());
  mocks.useItemVerbs.mockReturnValue({
    changeType: mocks.changeType,
    edit: mocks.edit,
    editValues: mocks.editValues,
    move: mocks.move,
    pickUp: mocks.pickUp,
  });
  mocks.useRevertEvent.mockReturnValue(mocks.revert);
});

describe('useRepairWrites', () => {
  it('applies the identified device placement', async () => {
    const { result } = renderHook(() => useRepairWrites(placementRepair()), { wrapper });

    await act(async () => {
      await result.current.run(action('use-mine'));
    });

    expect(mocks.move).toHaveBeenCalledWith('item-case-router-placement', {
      kind: 'location',
      locationId: 'location-office',
    });
  });

  it('saves fitting fields from an archived-field case', async () => {
    const { result } = renderHook(() => useRepairWrites(archivedRepair()), { wrapper });

    await act(async () => {
      await result.current.run(action('save-fitting'));
    });

    expect(mocks.editValues).toHaveBeenCalledWith('item-case-hdmi-shielding', [
      { fieldId: 'field-length', values: ['2 m'] },
    ]);
  });

  it('changes to the reported replacement type with fitting fields', async () => {
    const { result } = renderHook(() => useRepairWrites(typeReplacementRepair()), { wrapper });

    await act(async () => {
      await result.current.run(action('change-type'));
    });

    expect(mocks.changeType).toHaveBeenCalledWith('item-case-mesh-type', 'type-router', [
      { fieldId: 'field-wifi', values: ['802.11ax'] },
    ]);
  });

  it('restores a missing reference using its stable target id', async () => {
    const { result } = renderHook(() => useRepairWrites(referenceRepair()), { wrapper });

    await act(async () => {
      await result.current.run(action('restore-reference'));
    });

    expect(mocks.editValues).toHaveBeenCalledWith('item-case-lead-powers', [
      {
        fieldId: 'field-connected-item',
        values: [{ targetKind: 'item', targetId: 'item-desk-lamp' }],
      },
    ]);
  });
});
