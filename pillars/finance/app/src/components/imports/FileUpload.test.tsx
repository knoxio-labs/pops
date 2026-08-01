import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FileUpload } from './FileUpload';

function makeFile(name: string, sizeBytes: number, type = 'text/csv') {
  const file = new File(['a'.repeat(sizeBytes)], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function getFileInput() {
  return screen.getByLabelText('Upload CSV files') as HTMLInputElement;
}

function selectFiles(files: File[]) {
  fireEvent.change(getFileInput(), { target: { files } });
}

describe('FileUpload', () => {
  it('reports a valid CSV selection to the parent and displays it', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    const file = makeFile('transactions.csv', 1024);
    selectFiles([file]);

    expect(onFilesSelect).toHaveBeenCalledWith([file]);
    expect(screen.getByText('transactions.csv')).toBeInTheDocument();
  });

  it('accepts an uppercase .CSV extension', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    const file = makeFile('Transactions.CSV', 1024);
    selectFiles([file]);

    expect(onFilesSelect).toHaveBeenCalledWith([file]);
    expect(screen.getByText('Transactions.CSV')).toBeInTheDocument();
  });

  it('reports every file of a multi-file selection', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    const jan = makeFile('jan.csv', 1024);
    const feb = makeFile('feb.csv', 2048);
    selectFiles([jan, feb]);

    expect(onFilesSelect).toHaveBeenCalledWith([jan, feb]);
    expect(screen.getByText('jan.csv')).toBeInTheDocument();
    expect(screen.getByText('feb.csv')).toBeInTheDocument();
  });

  it('appends a later selection instead of replacing the staged batch', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    const jan = makeFile('jan.csv', 1024);
    const feb = makeFile('feb.csv', 1024);
    selectFiles([jan]);
    selectFiles([feb]);

    expect(onFilesSelect).toHaveBeenLastCalledWith([jan, feb]);
    expect(screen.getByText('jan.csv')).toBeInTheDocument();
    expect(screen.getByText('feb.csv')).toBeInTheDocument();
  });

  it('rejects a re-added identical file rather than importing it twice', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    const jan = makeFile('jan.csv', 1024);
    selectFiles([jan]);
    selectFiles([jan]);

    expect(onFilesSelect).toHaveBeenLastCalledWith([jan]);
    expect(screen.getByText(/jan\.csv: already added/i)).toBeInTheDocument();
  });

  it('rejects a wrong-extension file while keeping the files already accepted', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    const valid = makeFile('transactions.csv', 1024);
    selectFiles([valid]);
    selectFiles([makeFile('image.png', 1024, 'image/png')]);

    expect(onFilesSelect).toHaveBeenLastCalledWith([valid]);
    expect(screen.getByText(/image\.png: not a CSV file/i)).toBeInTheDocument();
    expect(screen.queryByText('image.png')).not.toBeInTheDocument();
    expect(screen.getByText('transactions.csv')).toBeInTheDocument();
  });

  it('rejects only the oversized member of a mixed selection', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} maxSizeMB={1} />);

    const ok = makeFile('small.csv', 1024);
    const oversized = makeFile('huge.csv', 2 * 1024 * 1024);
    selectFiles([ok, oversized]);

    expect(onFilesSelect).toHaveBeenLastCalledWith([ok]);
    expect(screen.getByText(/huge\.csv: too large/i)).toBeInTheDocument();
    expect(screen.queryByText('huge.csv')).not.toBeInTheDocument();
  });

  it('enforces an aggregate cap that no single file breaches', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} maxSizeMB={10} maxTotalSizeMB={1} />);

    const first = makeFile('a.csv', 600 * 1024);
    const second = makeFile('b.csv', 600 * 1024);
    selectFiles([first, second]);

    expect(onFilesSelect).toHaveBeenLastCalledWith([first]);
    expect(screen.getByText(/b\.csv: exceeds the 1MB total upload limit/i)).toBeInTheDocument();
  });

  it('removes one file from the batch without disturbing the others', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    const jan = makeFile('jan.csv', 1024);
    const feb = makeFile('feb.csv', 1024);
    selectFiles([jan, feb]);

    fireEvent.click(screen.getByLabelText('Remove jan.csv'));

    expect(onFilesSelect).toHaveBeenLastCalledWith([feb]);
    expect(screen.queryByText('jan.csv')).not.toBeInTheDocument();
    expect(screen.getByText('feb.csv')).toBeInTheDocument();
  });

  it('reports a selection exactly once under StrictMode', () => {
    const onFilesSelect = vi.fn();
    render(
      <StrictMode>
        <FileUpload onFilesSelect={onFilesSelect} />
      </StrictMode>
    );

    const jan = makeFile('jan.csv', 1024);
    selectFiles([jan]);

    // A double-invoked state updater would report the batch twice, and the
    // second report reaches the store as a fresh setFiles call.
    expect(onFilesSelect).toHaveBeenCalledTimes(1);
    expect(onFilesSelect).toHaveBeenCalledWith([jan]);
  });

  it('reports a removal exactly once under StrictMode', () => {
    const onFilesSelect = vi.fn();
    render(
      <StrictMode>
        <FileUpload onFilesSelect={onFilesSelect} />
      </StrictMode>
    );

    const jan = makeFile('jan.csv', 1024);
    const feb = makeFile('feb.csv', 1024);
    selectFiles([jan, feb]);
    onFilesSelect.mockClear();

    fireEvent.click(screen.getByLabelText('Remove jan.csv'));

    expect(onFilesSelect).toHaveBeenCalledTimes(1);
    expect(onFilesSelect).toHaveBeenCalledWith([feb]);
  });

  it('clears both display and reported batch on removal of the last file', () => {
    const onFilesSelect = vi.fn();
    render(<FileUpload onFilesSelect={onFilesSelect} />);

    selectFiles([makeFile('transactions.csv', 1024)]);
    fireEvent.click(screen.getByLabelText('Remove transactions.csv'));

    expect(onFilesSelect).toHaveBeenLastCalledWith([]);
    expect(screen.queryByText('transactions.csv')).not.toBeInTheDocument();
  });
});
