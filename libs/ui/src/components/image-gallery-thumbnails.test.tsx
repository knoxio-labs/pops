import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Lightbox } from './image-gallery-lightbox';
import { Thumbnails } from './image-gallery-thumbnails';

import type { ImageGalleryItem } from './image-gallery-types';

const item: ImageGalleryItem = {
  id: 'photo-1',
  src: '/photos/photo-1.jpg',
  alt: 'Desk lamp',
};

describe('ImageGallery failed-image fallbacks', () => {
  it('fails to load a thumbnail and reports the failed item', () => {
    const onImageError = vi.fn();

    render(
      <Thumbnails
        items={[item]}
        activeIndex={0}
        onPick={vi.fn()}
        failedIds={new Set()}
        onImageError={onImageError}
      />
    );

    fireEvent.error(screen.getByAltText('Desk lamp'));

    expect(onImageError).toHaveBeenCalledExactlyOnceWith('photo-1');
  });

  it('renders an explicit thumbnail fallback for a failed image', () => {
    render(
      <Thumbnails
        items={[item]}
        activeIndex={0}
        onPick={vi.fn()}
        failedIds={new Set(['photo-1'])}
        onImageError={vi.fn()}
      />
    );

    expect(screen.getByTitle('Photo did not load')).toBeInTheDocument();
    expect(screen.queryByAltText('Desk lamp')).not.toBeInTheDocument();
  });

  it('renders the explicit fallback in the lightbox for a failed image', () => {
    render(
      <Lightbox
        active={item}
        itemsLength={1}
        failed
        onImageError={vi.fn()}
        goPrev={vi.fn()}
        goNext={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Photo did not load')).toBeInTheDocument();
    expect(
      screen.getByText('The file is missing or damaged. Replace it or remove it.')
    ).toBeInTheDocument();
  });
});
