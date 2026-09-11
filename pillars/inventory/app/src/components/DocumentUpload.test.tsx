import { fireEvent, render, screen } from '@testing-library/react';
import { getI18n } from 'react-i18next';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import ptBRUi from '@pops/locales/pt-BR/ui.json';

import { DocumentUpload, type PendingDocumentFile } from './DocumentUpload';

function fileInput(): HTMLInputElement {
  return document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
}

describe('DocumentUpload', () => {
  const mockOnFilesSelected = vi.fn();
  const mockOnRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the drop zone with a documents helper text', () => {
    render(<DocumentUpload onFilesSelected={mockOnFilesSelected} maxSizeMb={5} />);
    expect(screen.getByText(/PDF, images, or text up to 5MB/)).toBeInTheDocument();
  });

  it('accepts a PDF via file input change', () => {
    render(<DocumentUpload onFilesSelected={mockOnFilesSelected} />);
    const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('rejects unsupported file types', () => {
    render(<DocumentUpload onFilesSelected={mockOnFilesSelected} />);
    const file = new File(['test'], 'archive.zip', { type: 'application/zip' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(mockOnFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByText('archive.zip is not an accepted file type')).toBeInTheDocument();
  });

  it('rejects oversized files', () => {
    render(<DocumentUpload onFilesSelected={mockOnFilesSelected} maxSizeMb={1} />);
    const bigContent = new Uint8Array(1.5 * 1024 * 1024);
    const file = new File([bigContent], 'big.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(mockOnFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByText('big.pdf exceeds max size of 1.0 MB')).toBeInTheDocument();
  });

  // Some browsers report an empty `type` for plain-text files; the extension
  // fallback in the shared `accept` list is what keeps these from being
  // refused as "unsupported".
  it('allows a text file by extension even without a text/ MIME type', () => {
    render(<DocumentUpload onFilesSelected={mockOnFilesSelected} />);
    const file = new File(['notes'], 'notes.txt', { type: '' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('renders the pending document list', () => {
    const files: PendingDocumentFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'warranty.pdf', { type: 'application/pdf' }),
        status: 'pending',
      },
    ];

    render(
      <DocumentUpload onFilesSelected={mockOnFilesSelected} files={files} onRemove={mockOnRemove} />
    );

    expect(screen.getByText('warranty.pdf')).toBeInTheDocument();
  });

  it('calls onRemove when the remove button is clicked', () => {
    const files: PendingDocumentFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'remove-me.pdf', { type: 'application/pdf' }),
        status: 'pending',
      },
    ];

    render(
      <DocumentUpload onFilesSelected={mockOnFilesSelected} files={files} onRemove={mockOnRemove} />
    );

    fireEvent.click(screen.getByRole('button', { name: /remove remove-me.pdf/i }));
    expect(mockOnRemove).toHaveBeenCalledWith('1');
  });

  it('disables interaction when disabled prop is true', () => {
    render(<DocumentUpload onFilesSelected={mockOnFilesSelected} disabled />);
    const dropZone = screen.getByRole('button', { name: /upload documents/i });

    const file = new File(['test'], 'disabled.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(mockOnFilesSelected).not.toHaveBeenCalled();
  });
});

describe('DocumentUpload — translated refusal (POPS-2115)', () => {
  // Guards against the refusal reverting to a hardcoded English template
  // literal, which the en-AU assertions above can't catch on their own.
  beforeAll(async () => {
    const i18n = getI18n();
    i18n.addResourceBundle('pt-BR', 'ui', ptBRUi);
    await i18n.changeLanguage('pt-BR');
  });

  afterAll(async () => {
    await getI18n().changeLanguage('en-AU');
  });

  it('renders a refused file in pt-BR, not English', () => {
    const onFilesSelected = vi.fn();
    render(<DocumentUpload onFilesSelected={onFilesSelected} />);

    const file = new File(['test'], 'archive.zip', { type: 'application/zip' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByText('archive.zip não é um tipo de arquivo aceito')).toBeInTheDocument();
    expect(screen.queryByText(/not an accepted file type/i)).not.toBeInTheDocument();
  });
});
