import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INVENTORY_ICONS } from '../model/icons.js';
import { ShortcutProvider } from '../shortcuts/shortcut-provider.js';
import { coreItem, coreWorld } from '../test-fixtures/core.js';
import { SelectionDock } from './selection-dock.js';
import { useListVerbs, useTrackedWrites } from './use-list-verbs.js';

import type { BulkResult } from '../../inventory-web/item-verbs-bulk.js';
import type {
  CatalogueDescriptor,
  CatalogueType,
} from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel, PlacementTarget } from '../model/index.js';
import type { SelectionApi } from '../selection/use-selection.js';
import type { ListVerbsInput, TrackedWrites } from './use-list-verbs.js';

type CatalogueField = CatalogueType['fields'][number];

function field(typeId: string, id: string, label: string): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id,
    key: id,
    kind: 'short_text',
    label,
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId,
  };
}

function type(id: string, label: string, fields: readonly CatalogueField[] = []): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [...fields],
    id,
    key: id,
    label,
    legacyLabels: [],
    parentTypeId: null,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function catalogue(types: readonly CatalogueType[]): CatalogueDescriptor {
  const actor = { id: 'test', kind: 'web' as const, label: 'Test' };
  return {
    revision: {
      abandoned: null,
      baseRevision: null,
      created: { actor, at: '2026-09-01T00:00:00.000Z' },
      draftVersion: 1,
      minimumProtocol: 2,
      published: { actor, at: '2026-09-01T00:00:00.000Z', note: null },
      revision: 1,
      status: 'published',
    },
    types: [...types],
  };
}

const mocks = vi.hoisted(() => ({
  useItemVerbs: vi.fn(),
  useBulkItemVerbs: vi.fn(),
  usePlacementSources: vi.fn(),
  showUndoToast: vi.fn(),
  single: {
    pickUp: vi.fn(),
    move: vi.fn(),
    putBack: vi.fn(),
  },
  bulk: {
    pickUp: vi.fn(),
    move: vi.fn(),
    changeType: vi.fn(),
    editValues: vi.fn(),
    setLifecycle: vi.fn(),
  },
}));

vi.mock('../../inventory-web/item-verbs.js', () => ({ useItemVerbs: mocks.useItemVerbs }));
vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: mocks.useBulkItemVerbs,
}));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../feedback/undo-toast.js', () => ({ showUndoToast: mocks.showUndoToast }));
vi.mock('../placement-picker/placement-picker.js', () => ({
  PlacementPicker: ({
    open,
    onPick,
  }: {
    open?: boolean;
    onPick: (target: PlacementTarget) => void;
  }) =>
    open ? (
      <button
        type="button"
        data-testid="picker-target"
        onClick={() => onPick({ kind: 'location', locationId: 'loc-garage' })}
      >
        Pick garage
      </button>
    ) : null,
}));
vi.mock('./bulk-move-sheet.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bulk-move-sheet.js')>();
  return {
    ...actual,
    BulkMoveSheet: ({
      open,
      onApply,
      onChangeTarget,
    }: {
      open: boolean;
      onApply: () => void;
      onChangeTarget: () => void;
    }) =>
      open ? (
        <div data-testid="bulk-move-sheet">
          <button type="button" onClick={onApply}>
            Apply move
          </button>
          <button type="button" onClick={onChangeTarget}>
            Change target
          </button>
        </div>
      ) : null,
  };
});

function appliedResult(ids: readonly string[]): BulkResult {
  return { applied: [...ids], refused: [], undo: async () => undefined };
}

function selection(ids: readonly string[], focusedId: string | null = null): SelectionApi {
  return {
    state: {
      selected: new Set(ids),
      anchorId: ids[0] ?? null,
      focusedId,
    },
    count: ids.length,
    coverage: ids.length === 0 ? 'none' : 'all',
    selectedIds: [...ids],
    isSelected: (id) => ids.includes(id),
    onRowToggle: () => undefined,
    onHeaderToggle: () => undefined,
    clearSelection: () => undefined,
    onKey: () => false,
  };
}

function tracked(): TrackedWrites {
  return {
    rejections: {},
    track: async (_ids, run) => run(),
    setRejection: vi.fn(),
  };
}

function input(overrides: Partial<ListVerbsInput> = {}): ListVerbsInput {
  return {
    rows: [coreItem('itm-lamp')],
    world: coreWorld,
    selection: selection(['itm-lamp']),
    contentCounts: {},
    offline: false,
    tracked: tracked(),
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return (
    <MemoryRouter>
      <ShortcutProvider globalHandlers={{}}>{children}</ShortcutProvider>
    </MemoryRouter>
  );
}

function Harness({ value }: { value: ListVerbsInput }): ReactNode {
  const verbs = useListVerbs(value);
  const move = verbs.actions.find((action) => action.id === 'move');
  return (
    <>
      <button type="button" onClick={move?.onSelect}>
        Move selection
      </button>
      {verbs.overlays}
    </>
  );
}

function BulkActionHarness({ value }: { value: ListVerbsInput }): ReactNode {
  const verbs = useListVerbs(value);
  return (
    <>
      {(['set-type', 'set-field', 'retire', 'discard'] as const).map((id) => {
        const action = verbs.actions.find((entry) => entry.id === id);
        return (
          <button key={id} type="button" onClick={action?.onSelect}>
            {id}
          </button>
        );
      })}
      {verbs.overlays}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useItemVerbs.mockReturnValue(mocks.single);
  mocks.useBulkItemVerbs.mockReturnValue(mocks.bulk);
  mocks.usePlacementSources.mockImplementation(() => ({
    world: coreWorld,
    recents: [],
    createLocation: { mutate: vi.fn() },
  }));
  mocks.single.pickUp.mockResolvedValue({
    status: 'applied',
    seq: 1,
    undo: async () => undefined,
  });
  mocks.single.move.mockResolvedValue({
    status: 'applied',
    seq: 2,
    undo: async () => undefined,
  });
  mocks.single.putBack.mockResolvedValue({
    status: 'applied',
    seq: 3,
    undo: async () => undefined,
  });
  mocks.bulk.pickUp.mockImplementation(async (ids: readonly string[]) => appliedResult(ids));
  mocks.bulk.move.mockImplementation(async (ids: readonly string[]) => appliedResult(ids));
  mocks.bulk.changeType.mockImplementation(async (ids: readonly string[]) => appliedResult(ids));
  mocks.bulk.editValues.mockImplementation(async (writes: readonly { id: string }[]) =>
    appliedResult(writes.map(({ id }) => id))
  );
  mocks.bulk.setLifecycle.mockImplementation(async (ids: readonly string[]) => appliedResult(ids));
});

describe('useTrackedWrites', () => {
  it('clears old reasons before a write and records per-item refusals', async () => {
    const { result } = renderHook(() => useTrackedWrites());

    await act(async () => {
      await result.current.track(['item-1'], async () => ({
        applied: [],
        refused: [
          {
            id: 'item-1',
            refusal: {
              kind: 'outcome',
              outcome: {
                status: 'rejected',
                mutationId: 'mutation-1',
                reason: 'closed',
                message: 'The box is closed.',
              },
            },
          },
        ],
        undo: null,
      }));
    });

    expect(result.current.rejections).toEqual({ 'item-1': 'The box is closed.' });
    await act(async () => {
      await result.current.track(['item-1'], async () => appliedResult(['item-1']));
    });
    expect(result.current.rejections).toEqual({});
  });
});

describe('useListVerbs', () => {
  it('binds the typed and lifecycle selection actions to live handlers', () => {
    const { result } = renderHook(() => useListVerbs(input()), { wrapper });

    for (const id of ['set-type', 'set-field', 'retire', 'discard'] as const) {
      expect(result.current.actions.find((action) => action.id === id)?.onSelect).toEqual(
        expect.any(Function)
      );
    }
  });

  it('executes the shared lifecycle dialog through the bulk verb and undo toast', async () => {
    render(<BulkActionHarness value={input()} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'retire' }));
    expect(screen.getByRole('dialog', { name: 'Retire 1 item?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retire 1 item' }));

    await waitFor(() =>
      expect(mocks.bulk.setLifecycle).toHaveBeenCalledWith(['itm-lamp'], 'retired', null)
    );
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'retired', message: 'Retired 1 item' })
    );
  });

  it('tracks only compatible rows when a bulk field write fails', async () => {
    const fieldDefinition = field('type-old', 'colour', 'Colour');
    const rows = [
      { ...coreItem('itm-lamp'), typeId: 'type-old', typeName: 'Old type' },
      { ...coreItem('itm-printer'), typeId: 'type-other', typeName: 'Other type' },
    ];
    const state = tracked();
    mocks.bulk.editValues.mockRejectedValueOnce(new Error('offline'));

    render(
      <BulkActionHarness
        value={input({
          rows,
          selection: selection(rows.map((row) => row.id)),
          tracked: state,
          catalogue: catalogue([
            type('type-old', 'Old type', [fieldDefinition]),
            type('type-other', 'Other type'),
          ]),
        })}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-field' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Colour' }), {
      target: { value: 'blue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set on 1 item' }));

    await waitFor(() =>
      expect(state.setRejection).toHaveBeenCalledWith(
        'itm-lamp',
        'The inventory service did not answer.'
      )
    );
    expect(state.setRejection).not.toHaveBeenCalledWith(
      'itm-printer',
      'The inventory service did not answer.'
    );
    expect(mocks.bulk.editValues).toHaveBeenCalledWith([
      {
        id: 'itm-lamp',
        patches: [{ fieldId: 'colour', values: ['blue'] }],
      },
    ]);
  });

  it('writes a shared field to every compatible selected row', async () => {
    const sharedField = field('type-old', 'colour', 'Colour');
    const rows = [
      { ...coreItem('itm-lamp'), typeId: 'type-old', typeName: 'Old type' },
      { ...coreItem('itm-printer'), typeId: 'type-other', typeName: 'Other type' },
      { ...coreItem('itm-drill'), typeId: 'type-missing', typeName: 'Missing type' },
    ];

    render(
      <BulkActionHarness
        value={input({
          rows,
          selection: selection(rows.map((row) => row.id)),
          catalogue: catalogue([
            type('type-old', 'Old type', [sharedField]),
            type('type-other', 'Other type', [{ ...sharedField, typeId: 'type-other' }]),
            type('type-missing', 'Missing type'),
          ]),
        })}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-field' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Colour' }), {
      target: { value: 'blue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set on 2 items' }));

    await waitFor(() =>
      expect(mocks.bulk.editValues).toHaveBeenCalledWith([
        {
          id: 'itm-lamp',
          patches: [{ fieldId: 'colour', values: ['blue'] }],
        },
        {
          id: 'itm-printer',
          patches: [{ fieldId: 'colour', values: ['blue'] }],
        },
      ])
    );
  });

  it('runs bulk pick up and offers one undo toast for applied ids', async () => {
    const { result } = renderHook(() => useListVerbs(input()), { wrapper });
    const action = result.current.actions.find((entry) => entry.id === 'pick-up');
    if (action?.onSelect === undefined) throw new Error('pick-up action was not created');

    act(() => action.onSelect?.());
    await waitFor(() => expect(mocks.bulk.pickUp).toHaveBeenCalledWith(['itm-lamp']));
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'pickUp', message: 'Picked up 1 item' })
    );
  });

  it('opens the picker, plans fixed moves and sends only moving ids', async () => {
    const value = input();
    render(<Harness value={value} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Move selection' }));
    expect(screen.getByTestId('picker-target')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('picker-target'));
    expect(screen.getByTestId('bulk-move-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply move' }));

    await waitFor(() =>
      expect(mocks.bulk.move).toHaveBeenCalledWith(['itm-lamp'], {
        kind: 'location',
        locationId: 'loc-garage',
      })
    );
  });

  it('records a refused put-back without calling the verb when no previous place exists', () => {
    const noPrevious = coreItem('itm-torch');
    const state = tracked();
    const { result } = renderHook(
      () =>
        useListVerbs(
          input({ rows: [noPrevious], selection: selection([], noPrevious.id), tracked: state })
        ),
      { wrapper }
    );

    act(() => result.current.onRowVerb('put-back', noPrevious));

    expect(state.setRejection).toHaveBeenCalledWith(
      noPrevious.id,
      'It has no place to go back to.'
    );
    expect(mocks.single.putBack).not.toHaveBeenCalled();
  });

  it('returns false and performs no writes while offline', () => {
    const { result } = renderHook(() => useListVerbs(input({ offline: true })), { wrapper });
    const pickUp = result.current.actions.find((entry) => entry.id === 'pick-up');
    if (pickUp?.onSelect === undefined) throw new Error('pick-up action was not created');

    act(() => pickUp.onSelect?.());
    const handled = result.current.keyHandlers['pick-up']?.(new KeyboardEvent('keydown'));

    expect(handled).toBe(false);
    expect(mocks.bulk.pickUp).not.toHaveBeenCalled();
    expect(mocks.single.pickUp).not.toHaveBeenCalled();
  });

  it('disables every selection action while offline', () => {
    const onSelect = vi.fn();
    const anchorRef = createRef<HTMLDivElement>();
    render(
      <SelectionDock
        selection={selection(['itm-lamp'])}
        loadedCount={1}
        carried={0}
        actions={[{ id: 'move', label: 'Move', icon: INVENTORY_ICONS.move, onSelect }]}
        offline
        anchorRef={anchorRef}
      />
    );

    const move = screen.getByRole('button', { name: /^Move/ });
    expect(move).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(move);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('copies codes in loaded row order and skips missing codes', () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const rows: ItemRowModel[] = [
      { ...coreItem('itm-lamp'), code: null },
      coreItem('itm-printer'),
      coreItem('itm-drill'),
    ];
    const { result } = renderHook(
      () => useListVerbs(input({ rows, selection: selection(['itm-drill', 'itm-printer']) })),
      { wrapper }
    );
    const action = result.current.actions.find((entry) => entry.id === 'copy-codes');
    if (action?.onSelect === undefined) throw new Error('copy-codes action was not created');

    act(() => action.onSelect?.());

    expect(writeText).toHaveBeenCalledWith('P01\nD01');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('keeps the label shortcut refused above the server limit', () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({
      ...coreItem('itm-lamp'),
      id: `item-${index}`,
    }));
    const { result } = renderHook(
      () => useListVerbs(input({ rows, selection: selection(rows.map((row) => row.id)) })),
      { wrapper }
    );
    const label = result.current.actions.find((entry) => entry.id === 'label');
    if (label === undefined) throw new Error('label action was not created');

    expect(label.disabledReason).toBe('Print labels takes at most 200 items');
    expect(result.current.keyHandlers.label?.(new KeyboardEvent('keydown'))).toBe(false);
  });
});
