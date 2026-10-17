import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotosField } from './photos-field';

describe('PhotosField file acceptance', () => {
  it.each(['photo.heic', 'photo.heif'])('forwards empty-MIME %s from the file picker', (name) => {
    const onFiles = vi.fn();
    const { container } = render(
      <PhotosField
        photos={[]}
        refused={[]}
        onRemove={vi.fn()}
        onRetry={vi.fn()}
        onFiles={onFiles}
      />
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('The photo picker is missing.');
    const file = new File(['photo'], name, { type: '' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([file]);
  });

  it('forwards dropped HEIC and HEIF files while rejecting an unsupported extension', () => {
    const onFiles = vi.fn();
    render(
      <PhotosField
        photos={[]}
        refused={[]}
        onRemove={vi.fn()}
        onRetry={vi.fn()}
        onFiles={onFiles}
      />
    );
    const heic = new File(['photo'], 'photo.HEIC', { type: '' });
    const heif = new File(['photo'], 'photo.heif', { type: '' });
    const document = new File(['document'], 'document.pdf', { type: '' });
    fireEvent.drop(screen.getByRole('button', { name: 'Add from disk' }), {
      dataTransfer: { files: [heic, document, heif] },
    });
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([heic, heif]);
  });
});
