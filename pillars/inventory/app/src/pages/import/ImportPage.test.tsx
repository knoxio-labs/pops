import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_BATCH_MAX_ROWS } from '@pops/inventory';

import { InventoryApiError } from '../../inventory-api-helpers.js';
import { MAX_LABEL_IDS } from '../labels-page/label-params.js';
import { ImportPage } from './ImportPage.js';

import type { downloadCsv } from '../../foundation/list-page/inventory-csv.js';
import type { commitWithProgress, BatchProgress } from '../../inventory-web/batch-commit.js';
import type { BatchCreate, BatchRow, BatchRun } from '../../inventory-web/useBatchCreate.js';
import type { DeleteCreatedResult } from '../../inventory-web/useDeleteCreated.js';

const mocks = vi.hoisted(() => ({
  validate: vi.fn<BatchCreate['validate']>(),
  commit: vi.fn<BatchCreate['commit']>(),
  commitWithProgress: vi.fn<typeof commitWithProgress>(),
  deleteCreated: vi.fn<(ids: readonly string[]) => Promise<DeleteCreatedResult>>(),
  downloadCsv: vi.fn<typeof downloadCsv>(),
  toast: vi.fn<(message: string) => void>(),
}));

vi.mock('../../inventory-web/useBatchCreate.js', () => ({
  useBatchCreate: () => ({ validate: mocks.validate, commit: mocks.commit, isRunning: false }),
}));
vi.mock('../../inventory-web/batch-commit.js', () => ({
  commitWithProgress: mocks.commitWithProgress,
}));
vi.mock('../../inventory-web/useDeleteCreated.js', () => ({
  useDeleteCreated: () => mocks.deleteCreated,
}));
vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: () => ({ types: [] }),
}));
vi.mock('../../foundation/list-page/inventory-csv.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../foundation/list-page/inventory-csv.js')
  >('../../foundation/list-page/inventory-csv.js');
  return { ...actual, downloadCsv: mocks.downloadCsv };
});
vi.mock('sonner', () => ({ toast: mocks.toast }));

function validOutcomes(rows: readonly BatchRow[]): BatchRun {
  return { outcomes: rows.map((_, row) => ({ status: 'valid' as const, row })) };
}

function createdOutcomes(rows: readonly BatchRow[]): BatchRun {
  return {
    outcomes: rows.map((_, row) => ({
      status: 'created' as const,
      row,
      itemId: `item-${String(row)}`,
    })),
  };
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input not found');
  return input;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderImport() {
  return render(
    <MemoryRouter initialEntries={['/inventory/import']}>
      <Routes>
        <Route
          path="/inventory/import"
          element={
            <>
              <ImportPage />
              <LocationProbe />
            </>
          }
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

async function uploadCsv(text: string, name = 'garage.csv'): Promise<void> {
  const user = userEvent.setup();
  await user.upload(fileInput(), new File([text], name, { type: 'text/csv' }));
}

async function checkRows(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Check \d+ rows/u }));
}

describe('ImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validate.mockImplementation(async (rows) => validOutcomes(rows));
    mocks.commit.mockImplementation(async (rows) => createdOutcomes(rows));
    mocks.commitWithProgress.mockImplementation(async (commit, rows, destination, onProgress) => {
      const run = await commit(rows, destination);
      onProgress({ sent: rows.length, total: rows.length, created: run.outcomes.length });
      return run;
    });
    mocks.deleteCreated.mockResolvedValue({ removed: [], kept: [] });
  });

  it('refuses a non-CSV drop with the design sentence exactly once', async () => {
    renderImport();
    const dropZone = screen.getByRole('button', { name: /Drop a CSV file here, or choose one/u });
    const xlsx = new File(['not a CSV'], 'garage-inventory-2025.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.drop(dropZone, { dataTransfer: { files: [xlsx] } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'garage-inventory-2025.xlsx was not read. Only CSV files can be imported. Save the sheet as CSV (comma separated) and choose it again.'
    );
    expect(alert.textContent?.match(/Only CSV files can be imported/gu)?.length).toBe(1);
  });

  it('shows only the header-only refusal reason', async () => {
    renderImport();
    await uploadCsv('Name\r\n', 'garage.csv');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('garage.csv was not read. It has no rows under the header.');
    expect(alert).not.toHaveTextContent('Only CSV files can be imported');
  });

  it('maps a guessed column and labels a changed column as chosen by the user', async () => {
    renderImport();
    await uploadCsv('Name,Qty,Extra\r\nLamp,2,blue');
    expect(await screen.findAllByText('Matched by its name')).not.toHaveLength(0);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Qty becomes' }), 'code');

    expect(screen.getByText('Chosen by you')).toBeInTheDocument();
    expect(screen.getByText('Ready to check rows')).toBeInTheDocument();
  });

  it('changes the selected occurrence when headers repeat', async () => {
    renderImport();
    await uploadCsv('Name,Note,Note\r\nLamp,first,second');

    const user = userEvent.setup();
    const noteColumns = screen.getAllByRole('combobox', { name: 'Note becomes' });
    const secondNoteColumn = noteColumns[1];
    if (secondNoteColumn === undefined) throw new Error('second Note column not found');
    await user.selectOptions(secondNoteColumn, 'where');
    await checkRows();

    expect(mocks.validate).toHaveBeenCalledWith([
      { name: 'Lamp', type: '', quantity: '', code: '', where: 'second', note: 'first' },
    ]);
  });

  it('blocks Check rows when a mapping has no Name column', async () => {
    renderImport();
    await uploadCsv('Quantity,Note\r\n2,missing name');

    expect(await screen.findByText('Before checking rows')).toBeInTheDocument();
    expect(screen.getByText('Choose the column that holds each item’s name.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check 1 rows' })).toBeDisabled();
  });

  it('previews parsed row numbers and filters to skipped rows', async () => {
    mocks.validate.mockResolvedValue({
      outcomes: [
        { status: 'valid', row: 0 },
        {
          status: 'invalid',
          row: 1,
          issues: [{ column: 'where', code: 'unknown', message: 'Unknown place' }],
        },
      ],
    });
    renderImport();
    await uploadCsv('Name,Where\r\nLamp,Pantry\r\nMug,Garage');
    await checkRows();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('2');
    expect(rows[1]).toHaveTextContent('Lamp');
    expect(rows[2]).toHaveTextContent('3');
    expect(rows[2]).toHaveTextContent('Unknown place');

    const user = userEvent.setup();
    await user.click(screen.getByRole('switch'));

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByText('Lamp')).not.toBeInTheDocument();
    expect(screen.getByText('Mug')).toBeInTheDocument();
  });

  it('shows a not-sent problem without outlining a cell', async () => {
    mocks.validate.mockResolvedValue({
      outcomes: [
        {
          status: 'not-sent',
          row: 0,
          error: new InventoryApiError('The inventory service is unavailable', undefined),
        },
      ],
    });
    renderImport();
    await uploadCsv('Name\r\nLamp');
    await checkRows();

    const message = screen.getByText('The inventory service is unavailable');
    const row = message.closest('[role="row"]');
    if (row === null) throw new Error('preview row not found');
    const highlightedCells = [...row.querySelectorAll('span')].filter((cell) =>
      cell.className.includes('bg-warning/15')
    );
    expect(highlightedCells).toHaveLength(0);
  });

  it('shows zero imported until the first commit slice reports progress', async () => {
    const rows = Array.from({ length: 450 }, (_, index) => `Lamp ${String(index)}`).join('\r\n');
    let report: ((progress: BatchProgress) => void) | undefined;
    let finish: ((run: BatchRun) => void) | undefined;
    mocks.commitWithProgress.mockImplementation(
      async (_commit, _rows, _destination, onProgress) => {
        report = onProgress;
        return new Promise<BatchRun>((resolve) => {
          finish = resolve;
        });
      }
    );
    renderImport();
    await uploadCsv(`Name\r\n${rows}`);
    await checkRows();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Import 450 items' }));

    expect(await screen.findByText('Imported 0 of 450')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Import progress' })).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    act(() => report?.({ sent: WEB_BATCH_MAX_ROWS, total: 450, created: 190 }));
    expect(screen.getByText('Imported 190 of 450')).toBeInTheDocument();
    act(() =>
      finish?.(
        createdOutcomes(
          Array.from({ length: 450 }, () => ({
            name: '',
            type: '',
            quantity: '',
            code: '',
            where: '',
            note: '',
          }))
        )
      )
    );
    await waitFor(() =>
      expect(screen.getByText('Imported 450 items from garage.csv')).toBeInTheDocument()
    );
  });

  it('downloads skipped rows after a partial import', async () => {
    mocks.validate.mockResolvedValue({
      outcomes: [
        { status: 'valid', row: 0 },
        {
          status: 'invalid',
          row: 1,
          issues: [{ column: 'quantity', code: 'invalid', message: 'Quantity is not a number' }],
        },
      ],
    });
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [
        { status: 'created', row: 0, itemId: 'item-lamp' },
        {
          status: 'invalid',
          row: 1,
          issues: [{ column: 'quantity', code: 'invalid', message: 'Quantity is not a number' }],
        },
      ],
    });
    renderImport();
    await uploadCsv('Name,Quantity\r\nLamp,2\r\nMug,two');
    await checkRows();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Import 1, skip 1' }));
    await screen.findByText('Imported 1 items from garage.csv');
    await user.click(screen.getByRole('button', { name: 'Download 1 skipped rows' }));

    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      'garage-skipped.csv',
      'Name,Quantity,Problem\r\nMug,two,Quantity is not a number'
    );
  });

  it('navigates to Items and labels and reports undo results', async () => {
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [{ status: 'created', row: 0, itemId: 'item-lamp' }],
    });
    const itemsRender = renderImport();
    await uploadCsv('Name\r\nLamp');
    await checkRows();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Import 1 items' }));
    await screen.findByText('Imported 1 items from garage.csv');
    await user.click(screen.getByRole('button', { name: 'Show the 1 in Items' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items?sort=updated');
    itemsRender.unmount();

    const labelsRender = renderImport();
    await uploadCsv('Name\r\nLamp');
    await checkRows();
    await user.click(screen.getByRole('button', { name: 'Import 1 items' }));
    await screen.findByText('Imported 1 items from garage.csv');
    await user.click(screen.getByRole('button', { name: 'Print 1 labels' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/labels?ids=item-lamp');
    labelsRender.unmount();

    renderImport();
    await uploadCsv('Name\r\nLamp');
    await checkRows();
    await user.click(screen.getByRole('button', { name: 'Import 1 items' }));
    await screen.findByText('Imported 1 items from garage.csv');
    mocks.deleteCreated.mockResolvedValue({ removed: ['item-lamp'], kept: ['item-other'] });
    await user.click(screen.getByRole('button', { name: 'Undo import' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Drop a CSV file here/u })).toBeInTheDocument()
    );
    expect(mocks.toast).toHaveBeenCalledWith('Removed 1 items. 1 could not be removed.');
  });

  it('disables Print labels above the labels page cap', async () => {
    const outcomes = Array.from({ length: MAX_LABEL_IDS + 1 }, (_, row) => ({
      status: 'created' as const,
      row,
      itemId: `item-${String(row)}`,
    }));
    mocks.commitWithProgress.mockResolvedValue({ outcomes });
    renderImport();
    const rows = Array.from({ length: MAX_LABEL_IDS + 1 }, (_, row) => `Lamp ${String(row)}`).join(
      '\r\n'
    );
    await uploadCsv(`Name\r\n${rows}`);
    await checkRows();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: `Import ${String(MAX_LABEL_IDS + 1)} items` })
    );
    await screen.findByText(`Imported ${String(MAX_LABEL_IDS + 1)} items from garage.csv`);
    expect(
      screen.getByRole('button', { name: `Print ${String(MAX_LABEL_IDS + 1)} labels` })
    ).toBeDisabled();
  });
});
