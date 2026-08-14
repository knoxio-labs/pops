import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReceiptIntake } from '../ReceiptIntake.js';
import { EMPTY_STAGING } from '../staging.js';

import type { ReceiptStaging } from '../useReceiptStaging.js';

function intake(overrides: Partial<ReceiptStaging> = {}): ReceiptStaging {
  return {
    staging: EMPTY_STAGING,
    addFiles: vi.fn(),
    refuse: vi.fn(),
    addText: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input not found');
  return input;
}

describe('ReceiptIntake', () => {
  // Without it the OS dialog offers every file on the machine, and the reader
  // finds out only after choosing one that the upload will not take it.
  it('filters the file dialog to the media types the upload accepts', () => {
    render(<ReceiptIntake intake={intake()} disabled={false} onSubmit={vi.fn()} />);

    const accept = fileInput().getAttribute('accept')?.split(',') ?? [];

    for (const mediaType of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
    ]) {
      expect(accept).toContain(mediaType);
    }
    for (const extension of ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.txt']) {
      expect(accept).toContain(extension);
    }
  });

  // The page names the accepted types in words of its own; the drop zone's
  // built-in hint would restate them above it as the raw attribute string.
  it('names the accepted types once, in words, not as the raw attribute', () => {
    render(<ReceiptIntake intake={intake()} disabled={false} onSubmit={vi.fn()} />);

    expect(screen.queryByText(/Accepts image\/jpeg/)).not.toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, WebP, GIF, PDF/)).toBeInTheDocument();
  });

  // A file dragged in bypasses the dialog filter, so the drop zone turns it
  // away in JS — and the page has to say so rather than swallow it.
  it('reports a dragged-in file the drop zone refused', () => {
    const refuse = vi.fn();
    const addFiles = vi.fn();
    render(
      <ReceiptIntake intake={intake({ refuse, addFiles })} disabled={false} onSubmit={vi.fn()} />
    );

    fireEvent.drop(screen.getAllByRole('button')[0] as HTMLElement, {
      dataTransfer: { files: [new File(['x'], 'till.heic', { type: 'image/heic' })] },
    });

    expect(refuse).toHaveBeenCalledExactlyOnceWith('till.heic');
    expect(addFiles).not.toHaveBeenCalled();
  });

  it('stages a dragged-in file the upload does accept', () => {
    const refuse = vi.fn();
    const addFiles = vi.fn();
    render(
      <ReceiptIntake intake={intake({ refuse, addFiles })} disabled={false} onSubmit={vi.fn()} />
    );

    const kept = new File(['x'], 'till.jpg', { type: 'image/jpeg' });
    fireEvent.drop(screen.getAllByRole('button')[0] as HTMLElement, {
      dataTransfer: { files: [kept] },
    });

    expect(refuse).not.toHaveBeenCalled();
    expect(addFiles).toHaveBeenCalledExactlyOnceWith([kept]);
  });
});
