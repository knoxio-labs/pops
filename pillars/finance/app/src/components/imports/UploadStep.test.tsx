import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { UploadStep } from './UploadStep';

beforeEach(() => {
  useImportStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadStep — resumed run without a re-attached file', () => {
  it('advances on Next without re-parsing when parsed rows already exist', () => {
    const parseSpy = vi.spyOn(Papa, 'parse');
    useImportStore.getState().setHeaders(['Date', 'Amount']);
    useImportStore.getState().setRows([{ Date: '01/01/2026', Amount: '-10.00' }]);

    render(<UploadStep />);

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
    render(<UploadStep />);

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
    render(<UploadStep />);

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
    render(<UploadStep />);

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
    render(<UploadStep />);

    selectFiles([csvFile('jan.csv', JAN), csvFile('empty.csv', 'Date,Description,Amount\n')]);
    clickNext();

    expect(await screen.findByText(/empty\.csv: CSV file is empty/)).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(1);
  });
});
