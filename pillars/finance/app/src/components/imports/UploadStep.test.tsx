import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { UploadStep } from './UploadStep';

// These tests are about parsing/merging behaviour, not the account picker
// (POPS-2840) — accounts/institutions/currencies are mocked to empty lists so
// `AccountAndFormatFields` never makes a real network call, and every test
// pre-selects an account directly on the store so the file-parsing UI it now
// gates stays reachable.
vi.mock('../../finance-api/index.js', () => ({
  accountsList: async () => ({ data: { data: [], pagination: { total: 0 } } }),
  institutionsList: async () => ({ data: { data: [] } }),
  currenciesList: async () => ({ data: { data: [] } }),
}));

function renderUploadStep(): ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <UploadStep />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useImportStore.getState().reset();
  useImportStore.getState().setAccount('acc-1', 'Test Account');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadStep — resumed run without a re-attached file', () => {
  it('advances on Next without re-parsing when parsed rows already exist', () => {
    const parseSpy = vi.spyOn(Papa, 'parse');
    useImportStore.getState().setHeaders(['Date', 'Amount']);
    useImportStore.getState().setRows([{ Date: '01/01/2026', Amount: '-10.00' }]);

    render(renderUploadStep());

    expect(
      screen.getByText(
        "Your files aren't re-attached after resuming — the parsed rows are preserved. Selecting any file starts a fresh import."
      )
    ).toBeInTheDocument();

    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    expect(useImportStore.getState().currentStep).toBe(2);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('keeps Next disabled and shows no resume notice with neither file nor rows', () => {
    render(renderUploadStep());

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText(/re-attached after resuming/)).not.toBeInTheDocument();
  });
});

function csvFile(name: string, contents: string): File {
  return new File([contents], name, { type: 'text/csv' });
}

function selectFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Upload CSV files'), { target: { files } });
}

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /Next|Processing/ }));
}

const JAN = 'Date,Description,Amount\n01/01/2026,Rent,-900.00\n31/01/2026,Coffee,-4.50\n';
const FEB = 'Date,Description,Amount\n31/01/2026,Coffee,-4.50\n02/02/2026,Rent,-900.00\n';

describe('UploadStep — merging several CSVs', () => {
  it('merges same-schema files into one row list and advances', async () => {
    render(renderUploadStep());

    selectFiles([csvFile('jan.csv', JAN), csvFile('feb.csv', FEB)]);
    clickNext();

    await waitFor(() => expect(useImportStore.getState().currentStep).toBe(2));
    const state = useImportStore.getState();
    expect(state.headers).toEqual(['Date', 'Description', 'Amount']);
    // Three distinct transactions: the 31/01 coffee appears in both exports.
    expect(state.rows).toHaveLength(3);
    expect(state.sourceFileNames).toEqual(['jan.csv', 'feb.csv']);
  });

  it('refuses to advance and names the file whose columns differ', async () => {
    render(renderUploadStep());

    selectFiles([
      csvFile('jan.csv', JAN),
      csvFile('other.csv', 'Date,Amount\n01/03/2026,-12.00\n'),
    ]);
    clickNext();

    expect(
      await screen.findByText(/"other\.csv" has different columns to "jan\.csv"/)
    ).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(useImportStore.getState().rows).toEqual([]);
  });

  it('reports which file failed to parse rather than failing anonymously', async () => {
    render(renderUploadStep());

    selectFiles([csvFile('jan.csv', JAN), csvFile('empty.csv', 'Date,Description,Amount\n')]);
    clickNext();

    expect(await screen.findByText(/empty\.csv: CSV file is empty/)).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(1);
  });
});

describe('UploadStep — a headerless export uploaded under a headed bank', () => {
  it('imports every line rather than losing the first charge to the header row', async () => {
    const lineCount = 556;
    const contents =
      Array.from(
        { length: lineCount },
        (_unused, index) => `01/07/2026,-${(index + 1).toFixed(2)},MERCHANT ${index + 1},,,,,`
      ).join('\r\n') + '\r\n';

    const { container } = render(renderUploadStep());

    // 'ANZ' is the headed dialect; the file is a headerless credit-card export.
    const anz = container.querySelector('[role="radio"][value="ANZ"]');
    if (!anz) throw new Error('ANZ radio not found');
    fireEvent.click(anz);
    selectFiles([csvFile('anz.csv', contents)]);
    clickNext();

    await waitFor(() => expect(useImportStore.getState().currentStep).toBe(2));
    const state = useImportStore.getState();
    expect(state.rows).toHaveLength(lineCount);
    expect(state.headers).not.toContain('MERCHANT 1');
    expect(state.rows[0]).toMatchObject({ 'Column 3': 'MERCHANT 1' });
  });
});
