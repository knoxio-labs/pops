import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileUpload, type FileValidationError } from './FileUpload';

function jpg(name: string, sizeBytes = 10): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'image/jpeg' });
}

function pdf(name: string): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

/** Chosen via the OS file dialog — the browser has already applied `accept`. */
async function chooseFiles(files: File[]) {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input not found');
  await userEvent.upload(input, files);
}

/**
 * Dragged in from the desktop — the one path `accept` does not filter for the
 * user, which is exactly why the component re-checks it in JS.
 */
function dropFiles(files: File[]) {
  const dropZone = screen.getByRole('button');
  fireEvent.drop(dropZone, { dataTransfer: { files } });
}

function firstError(onError: ReturnType<typeof vi.fn>): FileValidationError {
  const error = onError.mock.calls[0]?.[0] as FileValidationError | undefined;
  if (!error) throw new Error('onError was not called');
  return error;
}

describe('FileUpload — accept filter', () => {
  it('sets the input accept attribute so the OS dialog is filtered', () => {
    render(<FileUpload accept="image/jpeg,.pdf" onFilesSelected={vi.fn()} />);
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      'image/jpeg,.pdf'
    );
  });

  it('forwards a file that matches accept', async () => {
    const onFilesSelected = vi.fn();
    render(<FileUpload accept="image/jpeg" onFilesSelected={onFilesSelected} />);

    await chooseFiles([jpg('receipt.jpg')]);

    expect(onFilesSelected).toHaveBeenCalledExactlyOnceWith([expect.any(File)]);
  });

  it('refuses a dragged-in file that does not match accept, and never forwards it', () => {
    const onFilesSelected = vi.fn();
    const onError = vi.fn();
    render(<FileUpload accept="image/jpeg" onFilesSelected={onFilesSelected} onError={onError} />);

    dropFiles([pdf('invoice.pdf')]);

    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('FileUpload — default copy (no override)', () => {
  it('reports a localized default message for a rejected file type', () => {
    const onError = vi.fn();
    render(<FileUpload accept="image/jpeg" onFilesSelected={vi.fn()} onError={onError} />);

    dropFiles([pdf('invoice.pdf')]);

    const error = firstError(onError);
    if (error.type !== 'not-accepted')
      throw new Error(`expected "not-accepted", got ${error.type}`);
    expect(error.accept).toBe('image/jpeg');
    expect(error.file.name).toBe('invoice.pdf');
    expect(error.message).toBe('invoice.pdf is not an accepted file type');
  });

  it('reports a localized default message for a file over the size bound', async () => {
    const onError = vi.fn();
    render(<FileUpload maxSize={5} onFilesSelected={vi.fn()} onError={onError} />);

    await chooseFiles([jpg('big.jpg', 100)]);

    const error = firstError(onError);
    expect(error.type).toBe('too-large');
    expect(error.message).toContain('big.jpg');
    expect(error.message).toContain('exceeds max size of');
  });

  it('reports a localized default message when too many files are chosen', async () => {
    const onError = vi.fn();
    render(<FileUpload multiple maxFiles={1} onFilesSelected={vi.fn()} onError={onError} />);

    await chooseFiles([jpg('one.jpg'), jpg('two.jpg')]);

    const error = firstError(onError);
    if (error.type !== 'too-many') throw new Error(`expected "too-many", got ${error.type}`);
    expect(error.maxFiles).toBe(1);
    expect(error.attempted).toBe(2);
    expect(error.message).toBe('You can upload at most 1 file');
  });
});

describe('FileUpload — a consumer fully replacing the copy', () => {
  // The point of the structured reason: a consumer can build its own sentence
  // from `error.type` and the rejected file/bound, ignoring the library's
  // `message`, without giving up the `accept` dialog filter.
  it('lets the consumer render entirely custom text while keeping accept', () => {
    const seen: string[] = [];
    const onError = (error: FileValidationError) => {
      const custom =
        error.type === 'not-accepted'
          ? `nope, ${error.file.name} — this receipt box only takes ${error.accept}`
          : 'unexpected';
      seen.push(custom);
    };

    render(
      <FileUpload
        accept="image/jpeg,.pdf"
        onFilesSelected={vi.fn()}
        onError={onError}
        prompt="Drop your receipt"
      />
    );

    // The library's own drop-prompt default is nowhere on screen — the consumer
    // supplied its own — while the accept filter is still wired to the input.
    expect(screen.queryByText('Drag a file here, or click to browse')).not.toBeInTheDocument();
    expect(screen.getByText('Drop your receipt')).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      'image/jpeg,.pdf'
    );

    dropFiles([new File(['x'], 'notes.gif', { type: 'image/gif' })]);

    expect(seen).toEqual(['nope, notes.gif — this receipt box only takes image/jpeg,.pdf']);
  });
});

describe('FileUpload — file list', () => {
  it('labels the remove button from the translated catalog, not a raw template', async () => {
    const onRemoveFile = vi.fn();
    render(
      <FileUpload
        onFilesSelected={vi.fn()}
        files={[jpg('receipt.jpg')]}
        onRemoveFile={onRemoveFile}
      />
    );

    const remove = screen.getByRole('button', { name: 'Remove receipt.jpg' });
    await userEvent.click(remove);

    expect(onRemoveFile).toHaveBeenCalledExactlyOnceWith(0);
  });
});
