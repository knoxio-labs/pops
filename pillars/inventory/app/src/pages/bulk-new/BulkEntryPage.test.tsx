import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { InventoryApiError } from '../../inventory-api-helpers.js';
import { MAX_LABEL_IDS } from '../labels-page/label-params.js';
import { BulkEntryPage } from './BulkEntryPage.js';

import type { ReactElement } from 'react';

import type { PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { BatchProgress } from '../../inventory-web/batch-commit.js';
import type {
  BatchCreate,
  BatchDestination,
  BatchRow,
  BatchRun,
} from '../../inventory-web/useBatchCreate.js';

type ShortcutHandler = (event: KeyboardEvent) => boolean | void;

const mocks = vi.hoisted(() => ({
  useCatalogueLookups: vi.fn(),
  useOnline: vi.fn(),
  usePlacementSources: vi.fn(),
  validate: vi.fn(),
  commit: vi.fn(),
  commitWithProgress: vi.fn(),
  deleteCreated: vi.fn(),
  toast: vi.fn(),
  shortcut: { handler: undefined as ShortcutHandler | undefined },
}));

vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/useBatchCreate.js', () => ({
  useBatchCreate: () => ({ validate: mocks.validate, commit: mocks.commit, isRunning: false }),
}));
vi.mock('../../inventory-web/batch-commit.js', () => ({
  commitWithProgress: (...args: unknown[]) => mocks.commitWithProgress(...args),
}));
vi.mock('../../inventory-web/useDeleteCreated.js', () => ({
  useDeleteCreated: () => mocks.deleteCreated,
}));
vi.mock('../../foundation/shortcuts/shortcut-provider.js', () => ({
  useShortcutScope: (_scope: string, handlers: Record<string, ShortcutHandler>) => {
    mocks.shortcut.handler = handlers['form-save'];
  },
}));
vi.mock('../../foundation/placement-picker/placement-picker.js', () => ({
  PlacementPicker: ({
    open,
    onOpenChange,
    onPick,
  }: {
    trigger: ReactElement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onPick: (target: PlacementTarget) => void;
  }) => (
    <>
      <button type="button" onClick={() => onOpenChange?.(true)}>
        Change
      </button>
      {open ? (
        <button
          type="button"
          onClick={() => {
            onPick({ kind: 'location', locationId: 'pantry' });
            onOpenChange?.(false);
          }}
        >
          Pick Pantry
        </button>
      ) : null}
    </>
  ),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

const kitchen = { id: 'kitchen', name: 'Kitchen', parentId: null, kind: 'room' as const };
const pantry = { id: 'pantry', name: 'Pantry', parentId: null, kind: 'storage' as const };
const box = {
  id: 'box',
  name: 'Cable box',
  typeId: 'type-box',
  typeName: 'Box',
  code: null,
  quantity: 1,
  container: { access: 'open' as const, full: false },
  lifecycle: 'active' as const,
  placement: { kind: 'location' as const, locationId: kitchen.id },
  previous: null,
  sync: 'synced' as const,
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-20T09:00:00.000Z',
};

const world: PlacementWorld = buildWorld([box], [kitchen, pantry]);
const catalogueType = {
  id: 'type-cable',
  key: 'cable',
  label: 'Cable',
  sortOrder: 0,
  archivedAt: null,
  capabilities: [],
  description: null,
  fields: [],
  legacyLabels: [],
  presentation: {},
  replacedBy: null,
  revision: 1,
  parentTypeId: null,
};
const beddingType = {
  ...catalogueType,
  id: 'type-bedding',
  key: 'bedding',
  label: 'Bedding',
};
const sheetType = {
  ...catalogueType,
  id: 'type-sheet',
  key: 'sheet',
  label: 'Sheet',
  parentTypeId: beddingType.id,
};
type TestCatalogueType = Omit<typeof catalogueType, 'parentTypeId'> & {
  parentTypeId: string | null;
};

let currentOnline = true;
let placementLoading = false;
let placementError = false;
let cataloguePending = false;
let catalogueError: Error | null = null;

function LocationProbe(): ReactElement {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function allValid(rows: readonly BatchRow[]): BatchRun {
  return { outcomes: rows.map((_, row) => ({ status: 'valid' as const, row })) };
}

function allCreated(rows: readonly BatchRow[]): BatchRun {
  return {
    outcomes: rows.map((_, row) => ({
      status: 'created' as const,
      row,
      itemId: `item-${String(row)}`,
    })),
  };
}

function renderPage(
  initialEntry = '/inventory/items/bulk-new',
  types: readonly TestCatalogueType[] = [catalogueType]
) {
  mocks.useCatalogueLookups.mockImplementation(() => ({
    types,
    isPending: cataloguePending,
    error: catalogueError,
  }));
  mocks.usePlacementSources.mockImplementation(() => ({
    world,
    recents: [],
    isLoading: placementLoading,
    isError: placementError,
  }));
  mocks.useOnline.mockImplementation(() => currentOnline);
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/inventory/items/bulk-new"
          element={
            <>
              <BulkEntryPage />
              <LocationProbe />
            </>
          }
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

async function settleValidation(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settlePromise(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function typeFirstRow(value = 'Drill'): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Name, row 1' }), {
    target: { value },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  currentOnline = true;
  placementLoading = false;
  placementError = false;
  cataloguePending = false;
  catalogueError = null;
  mocks.validate.mockImplementation((rows: readonly BatchRow[]) => Promise.resolve(allValid(rows)));
  mocks.commit.mockResolvedValue({ outcomes: [] });
  mocks.commitWithProgress.mockImplementation(
    async (
      commit: BatchCreate['commit'],
      rows: readonly BatchRow[],
      destination: BatchDestination,
      onProgress: (progress: BatchProgress) => void
    ) => {
      onProgress({ sent: rows.length, total: rows.length, created: rows.length });
      return commit(rows, destination);
    }
  );
  mocks.deleteCreated.mockResolvedValue({ removed: [], kept: [] });
  mocks.shortcut.handler = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BulkEntryPage', () => {
  it('renders the route with typed rows, three spare rows, and the destination placeholder', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Bulk entry' })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Items to create' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(18);
    expect(screen.getByRole('textbox', { name: 'Name, row 1' })).toHaveAttribute(
      'placeholder',
      'Required'
    );
    expect(screen.getByRole('textbox', { name: 'Where, row 1' })).toHaveAttribute(
      'placeholder',
      'In hand'
    );
  });

  it('applies in and type URL presets only after their sources resolve', () => {
    placementLoading = true;
    cataloguePending = true;
    const view = renderPage('/inventory/items/bulk-new?in=kitchen&type=cable');
    expect(screen.getByRole('combobox', { name: 'Default type' })).toHaveValue('');
    expect(screen.getByTitle('In hand')).toBeInTheDocument();

    placementLoading = false;
    cataloguePending = false;
    act(() =>
      view.rerender(
        <MemoryRouter initialEntries={['/inventory/items/bulk-new?in=kitchen&type=cable']}>
          <Routes>
            <Route path="/inventory/items/bulk-new" element={<BulkEntryPage />} />
          </Routes>
        </MemoryRouter>
      )
    );

    expect(screen.getByTitle('Kitchen')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Default type' })).toHaveValue('cable');
  });

  it('does not overwrite a destination picked before URL sources resolve', () => {
    placementLoading = true;
    const view = renderPage('/inventory/items/bulk-new?in=kitchen');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Pantry' }));

    placementLoading = false;
    act(() =>
      view.rerender(
        <MemoryRouter initialEntries={['/inventory/items/bulk-new?in=kitchen']}>
          <Routes>
            <Route path="/inventory/items/bulk-new" element={<BulkEntryPage />} />
          </Routes>
        </MemoryRouter>
      )
    );

    expect(screen.getByTitle('Pantry')).toBeInTheDocument();
  });

  it('typing in a cell reaches the debounced check', async () => {
    renderPage();
    typeFirstRow('Drill');
    await settleValidation();
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.validate.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ name: 'Drill' })]);
  });

  it('takes over a multi-line paste into a cell as complete rows', async () => {
    renderPage();
    const input = screen.getByRole('textbox', { name: 'Where, row 2' });
    const event = createEvent.paste(input, {
      clipboardData: { getData: () => 'a\tcable\nb\tcable' },
    });
    fireEvent(input, event);
    await settlePromise();

    expect(screen.getByRole('textbox', { name: 'Name, row 2' })).toHaveValue('a');
    expect(screen.getByRole('textbox', { name: 'Type, row 2' })).toHaveValue('cable');
    expect(screen.getByRole('textbox', { name: 'Name, row 3' })).toHaveValue('b');
    expect(event.defaultPrevented).toBe(true);
  });

  it('opens a hierarchical type tree, shows child paths, and selects a child path', () => {
    renderPage('/inventory/items/bulk-new', [beddingType, sheetType]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name, row 1' }), {
      target: { value: 'Guest fitted sheet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose Type, row 1' }));

    const tree = screen.getByRole('tree');
    expect(tree).toBeInTheDocument();
    expect(within(tree).queryByText('Bedding › Sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(within(tree).getByText('Bedding › Sheet')).toBeInTheDocument();

    fireEvent.click(within(tree).getByText('Bedding › Sheet'));
    expect(screen.getByRole('textbox', { name: 'Type, row 1' })).toHaveValue('Bedding › Sheet');
    expect(screen.getByRole('textbox', { name: 'Name, row 1' })).toHaveValue('Guest fitted sheet');
  });

  it('searches the type tree by a child path and clears the selected type', () => {
    renderPage('/inventory/items/bulk-new', [beddingType, sheetType]);
    const typePicker = screen.getByRole('button', { name: 'Choose Type, row 1' });
    fireEvent.click(typePicker);
    fireEvent.change(screen.getByPlaceholderText('Search types'), {
      target: { value: 'sheet' },
    });

    const tree = screen.getByRole('tree');
    expect(within(tree).getByText('Bedding › Sheet')).toBeInTheDocument();
    fireEvent.click(within(tree).getByText('Bedding › Sheet'));
    expect(screen.getByRole('textbox', { name: 'Type, row 1' })).toHaveValue('Bedding › Sheet');

    fireEvent.click(typePicker);
    fireEvent.click(screen.getByText('Clear selection'));
    expect(screen.getByRole('textbox', { name: 'Type, row 1' })).toHaveValue('');
  });

  it('keeps legacy flat type typing and table paste behavior', () => {
    renderPage('/inventory/items/bulk-new', [beddingType, sheetType]);
    const typeInput = screen.getByRole('textbox', { name: 'Type, row 1' });
    fireEvent.change(typeInput, { target: { value: 'Sheet' } });
    expect(typeInput).toHaveValue('Sheet');

    const event = createEvent.paste(typeInput, {
      clipboardData: { getData: () => 'A\tSheet\nB\tBedding' },
    });
    fireEvent(typeInput, event);

    expect(screen.getByRole('textbox', { name: 'Name, row 1' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Type, row 1' })).toHaveValue('Sheet');
    expect(screen.getByRole('textbox', { name: 'Name, row 2' })).toHaveValue('B');
    expect(screen.getByRole('textbox', { name: 'Type, row 2' })).toHaveValue('Bedding');
    expect(event.defaultPrevented).toBe(true);
  });

  it('overwrites only the pasted rows and keeps three spare rows', async () => {
    renderPage();
    ['A', 'B', 'C'].forEach((value, index) => {
      fireEvent.change(screen.getByRole('textbox', { name: `Name, row ${String(index + 1)}` }), {
        target: { value },
      });
    });
    const input = screen.getByRole('textbox', { name: 'Name, row 1' });
    fireEvent.paste(input, {
      clipboardData: { getData: () => 'x\tcable\ny\tcable' },
    });
    await settlePromise();

    expect(screen.getByRole('textbox', { name: 'Name, row 1' })).toHaveValue('x');
    expect(screen.getByRole('textbox', { name: 'Name, row 2' })).toHaveValue('y');
    expect(screen.getByRole('textbox', { name: 'Name, row 3' })).toHaveValue('C');
    expect(screen.getByRole('textbox', { name: 'Name, row 6' })).toHaveValue('');
    expect(screen.queryByRole('textbox', { name: 'Name, row 7' })).not.toBeInTheDocument();
  });

  it('moves Enter to the same column on the next row', () => {
    renderPage();
    const input = screen.getByRole('textbox', { name: 'Where, row 1' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Where, row 2' })).toHaveFocus();
  });

  it('keeps the next row text in place when a created row is removed', async () => {
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [
        { status: 'created', row: 0, itemId: 'item-1' },
        {
          status: 'invalid',
          row: 1,
          issues: [{ column: 'name', code: 'duplicate', message: 'Duplicate' }],
        },
        {
          status: 'invalid',
          row: 2,
          issues: [{ column: 'name', code: 'duplicate', message: 'Duplicate' }],
        },
      ],
    });
    renderPage();
    ['A', 'B', 'C'].forEach((value, index) => {
      fireEvent.change(screen.getByRole('textbox', { name: `Name, row ${String(index + 1)}` }), {
        target: { value },
      });
    });
    await settleValidation();
    fireEvent.click(screen.getByRole('button', { name: /^Create 3 items/ }));
    await settlePromise();
    expect(screen.getByRole('textbox', { name: 'Name, row 1' })).toHaveValue('B');
    expect(screen.getByRole('textbox', { name: 'Name, row 2' })).toHaveValue('C');
  });

  it('creates from the registered Mod+Enter handler inside a cell', async () => {
    renderPage();
    typeFirstRow();
    await settleValidation();
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [{ status: 'created', row: 0, itemId: 'item-1' }],
    });
    const event = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true });
    let handled = false;
    act(() => {
      handled = mocks.shortcut.handler?.(event) ?? false;
    });
    expect(handled).toBe(true);
    await settlePromise();
    expect(mocks.commitWithProgress).toHaveBeenCalledOnce();
  });

  it('states how many rows are ready and how many remain to fix', async () => {
    mocks.validate.mockResolvedValue({
      outcomes: [
        { status: 'valid', row: 0 },
        {
          status: 'invalid',
          row: 1,
          issues: [{ column: 'name', code: 'duplicate', message: 'Duplicate' }],
        },
      ],
    });
    renderPage();
    typeFirstRow('A');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name, row 2' }), {
      target: { value: 'B' },
    });
    await settleValidation();
    expect(screen.getByRole('button', { name: /^Create 1, keep 1 to fix/ })).toBeEnabled();
    expect(screen.getByText('2 rows: 1 ready, 1 to fix')).toBeInTheDocument();
  });

  it('shows commit progress as the sent share', async () => {
    let resolveCommit: ((run: BatchRun) => void) | undefined;
    const pending = new Promise<BatchRun>((resolve) => {
      resolveCommit = resolve;
    });
    mocks.commitWithProgress.mockImplementation(
      (
        _commit: BatchCreate['commit'],
        _rows: readonly BatchRow[],
        _destination: BatchDestination,
        onProgress: (progress: BatchProgress) => void
      ) => {
        onProgress({ sent: 200, total: 400, created: 0 });
        return pending;
      }
    );
    renderPage();
    typeFirstRow();
    await settleValidation();
    fireEvent.click(screen.getByRole('button', { name: /^Create 1 item/ }));
    expect(screen.getByRole('progressbar', { name: 'Creating items' })).toHaveAttribute(
      'aria-valuenow',
      '50'
    );
    resolveCommit?.({ outcomes: [{ status: 'created', row: 0, itemId: 'item-1' }] });
    await settlePromise();
  });

  it('shows the transport error and gives offline precedence', async () => {
    const error = new InventoryApiError('server unavailable', undefined);
    mocks.validate.mockResolvedValue({ outcomes: [{ status: 'not-sent', row: 0, error }] });
    const view = renderPage();
    typeFirstRow();
    await settleValidation();
    expect(screen.getByText('Some rows were not sent')).toBeInTheDocument();

    currentOnline = false;
    act(() => {
      view.rerender(
        <MemoryRouter initialEntries={['/inventory/items/bulk-new']}>
          <Routes>
            <Route path="/inventory/items/bulk-new" element={<BulkEntryPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Some rows were not sent')).not.toBeInTheDocument();

    currentOnline = true;
    act(() => {
      view.rerender(
        <MemoryRouter initialEntries={['/inventory/items/bulk-new']}>
          <Routes>
            <Route path="/inventory/items/bulk-new" element={<BulkEntryPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await settlePromise();
    expect(screen.getByText('Some rows were not sent')).toBeInTheDocument();
  });

  it('clears every row while keeping destination and default type controls', () => {
    renderPage('/inventory/items/bulk-new?in=kitchen&type=cable');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name, row 1' }), {
      target: { value: 'Drill' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear grid' }));
    expect(screen.getByRole('textbox', { name: 'Name, row 1' })).toHaveValue('');
    expect(screen.getByTitle('Kitchen')).toBeInTheDocument();
  });

  it('prints labels using the created ids', async () => {
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [{ status: 'created', row: 0, itemId: 'item-1' }],
    });
    renderPage();
    typeFirstRow();
    await settleValidation();
    fireEvent.click(screen.getByRole('button', { name: /^Create 1 item/ }));
    await settlePromise();
    fireEvent.click(screen.getByRole('button', { name: 'Print 1 labels' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/labels?ids=item-1');
  });

  it('disables Print labels above the label cap without navigating', async () => {
    const text = Array.from(
      { length: MAX_LABEL_IDS + 1 },
      (_, index) => `Item ${String(index)}`
    ).join('\n');
    mocks.validate.mockImplementation((rows: readonly BatchRow[]) =>
      Promise.resolve(allValid(rows))
    );
    mocks.commitWithProgress.mockImplementation(
      async (
        _commit: BatchCreate['commit'],
        rows: readonly BatchRow[],
        _destination: BatchDestination,
        onProgress: (progress: BatchProgress) => void
      ) => {
        onProgress({ sent: rows.length, total: rows.length, created: rows.length });
        return allCreated(rows);
      }
    );
    renderPage();
    fireEvent.paste(screen.getByRole('textbox', { name: 'Name, row 1' }), {
      clipboardData: { getData: () => text },
    });
    await settlePromise();
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^Create ${String(MAX_LABEL_IDS + 1)} items`) })
    );
    await settlePromise();
    const print = screen.getByRole('button', {
      name: `Print ${String(MAX_LABEL_IDS + 1)} labels`,
    });
    expect(print).toBeDisabled();
    fireEvent.click(print);
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items/bulk-new');
  });

  it('shows Items sorted by recently changed after creation', async () => {
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [{ status: 'created', row: 0, itemId: 'item-1' }],
    });
    renderPage();
    typeFirstRow();
    await settleValidation();
    fireEvent.click(screen.getByRole('button', { name: /^Create 1 item/ }));
    await settlePromise();
    fireEvent.click(screen.getByRole('button', { name: 'Show in Items' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items?sort=updated');
  });

  it('undoes created ids and reports removed and kept counts', async () => {
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [{ status: 'created', row: 0, itemId: 'item-1' }],
    });
    mocks.deleteCreated.mockResolvedValue({ removed: ['item-1'], kept: ['item-2'] });
    renderPage();
    typeFirstRow();
    await settleValidation();
    fireEvent.click(screen.getByRole('button', { name: /^Create 1 item/ }));
    await settlePromise();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await settlePromise();
    expect(mocks.deleteCreated).toHaveBeenCalledWith(['item-1']);
    expect(mocks.toast).toHaveBeenCalledWith('Removed 1 items. 1 could not be removed.');
  });

  it('opens Change and applies the picked destination', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Pantry' }));
    expect(screen.getByTitle('Pantry')).toBeInTheDocument();
  });

  it('disables Create and pauses checking offline', async () => {
    currentOnline = false;
    renderPage();
    typeFirstRow();
    await settleValidation();
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Create/ })).toBeDisabled();
  });
});
