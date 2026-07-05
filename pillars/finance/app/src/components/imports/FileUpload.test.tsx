import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileUpload } from './FileUpload';

function makeFile(name: string, sizeBytes: number, type = 'text/csv') {
  const file = new File(['a'.repeat(sizeBytes)], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function getFileInput() {
  return screen.getByLabelText('Upload CSV file') as HTMLInputElement;
}

describe('FileUpload', () => {
  it('reports a valid CSV selection to the parent and displays it', () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} />);

    const file = makeFile('transactions.csv', 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(screen.getByText('transactions.csv')).toBeInTheDocument();
  });

  it('accepts an uppercase .CSV extension', () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} />);

    const file = makeFile('Transactions.CSV', 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(screen.getByText('Transactions.CSV')).toBeInTheDocument();
  });

  it('rejecting a wrong-extension file notifies the parent the store file is gone, not just the display', () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} />);

    const invalidFile = makeFile('image.png', 1024, 'image/png');
    fireEvent.change(getFileInput(), { target: { files: [invalidFile] } });

    expect(onFileSelect).toHaveBeenCalledWith(null);
    expect(screen.getByText(/invalid file type/i)).toBeInTheDocument();
    expect(screen.queryByText('image.png')).not.toBeInTheDocument();
  });

  it('rejecting an oversized file notifies the parent the store file is gone, not just the display', () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} maxSizeMB={1} />);

    const oversizedFile = makeFile('huge.csv', 2 * 1024 * 1024);
    fireEvent.change(getFileInput(), { target: { files: [oversizedFile] } });

    expect(onFileSelect).toHaveBeenCalledWith(null);
    expect(screen.getByText(/File too large/i)).toBeInTheDocument();
  });

  it('does not leave a stale valid selection reported to the parent once a re-selection is rejected', () => {
    const onFileSelect = vi.fn();
    const { rerender } = render(<FileUpload onFileSelect={onFileSelect} initialFile={null} />);

    const validFile = makeFile('transactions.csv', 1024);
    fireEvent.change(getFileInput(), { target: { files: [validFile] } });
    expect(onFileSelect).toHaveBeenLastCalledWith(validFile);

    fireEvent.click(screen.getByLabelText('Remove file'));
    expect(onFileSelect).toHaveBeenLastCalledWith(null);

    rerender(<FileUpload onFileSelect={onFileSelect} initialFile={null} />);
    const invalidFile = makeFile('image.png', 1024, 'image/png');
    fireEvent.change(getFileInput(), { target: { files: [invalidFile] } });

    expect(onFileSelect).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('transactions.csv')).not.toBeInTheDocument();
  });

  it('clears both display and store file on explicit removal', () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} />);

    const file = makeFile('transactions.csv', 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    fireEvent.click(screen.getByLabelText('Remove file'));

    expect(onFileSelect).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('transactions.csv')).not.toBeInTheDocument();
  });
});
