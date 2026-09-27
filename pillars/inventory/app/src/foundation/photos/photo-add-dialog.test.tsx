import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoAddDialog } from './photo-add-dialog';

import type { PhotoUploads } from './use-photo-uploads';

const mocks = vi.hoisted(() => ({ usePhotoUploads: vi.fn() }));

vi.mock('./use-photo-uploads', () => ({ usePhotoUploads: mocks.usePhotoUploads }));

function uploads(overrides: Partial<PhotoUploads> = {}): PhotoUploads {
  return {
    queue: [],
    refused: [],
    add: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
    flush: vi.fn(async () => ({ attached: 0, queue: [] })),
    reset: vi.fn(),
    stagedCount: 0,
    attachedCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usePhotoUploads.mockReturnValue(uploads());
});

describe('PhotoAddDialog', () => {
  it('opens the add dialog with the shared file picker', () => {
    render(<PhotoAddDialog itemId="item-1" itemName="Desk lamp" existingPhotoCount={2} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add photo' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add photos to Desk lamp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add from disk' })).toBeInTheDocument();
    expect(screen.getByText(/up to 20 MB are accepted/)).toBeInTheDocument();
    expect(mocks.usePhotoUploads).toHaveBeenCalledWith('edit', 'item-1', 2);
  });

  it('renders gallery upload failures and refused files without hiding the dialog', () => {
    mocks.usePhotoUploads.mockReturnValue(
      uploads({
        queue: [
          {
            localId: 'broken',
            fileName: 'broken.jpg',
            bytes: 1024,
            status: { kind: 'failed', reason: 'the inventory service did not answer' },
          },
        ],
        refused: ['large.jpg is over 20 MB.'],
      })
    );

    render(<PhotoAddDialog itemId="item-1" itemName="Desk lamp" existingPhotoCount={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add photo' }));

    expect(
      screen.getByText('Did not upload: the inventory service did not answer.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry broken.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'large.jpg is over 20 MB. It was not added.'
    );
    expect(screen.getByRole('button', { name: 'Done' })).not.toBeDisabled();
  });

  it('does not open when the item is read-only', () => {
    render(
      <PhotoAddDialog
        itemId="item-1"
        itemName="Desk lamp"
        existingPhotoCount={0}
        disabledReason="Nothing can change on this item."
      />
    );

    const add = screen.getByRole('button', { name: 'Add photo' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(add);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
