import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PhotosSection } from './photos-section';

import type { DetailPhoto } from './detail-model';

const photos: DetailPhoto[] = [
  {
    id: 'front',
    url: '/inventory-api/media/front?variant=medium',
    thumbUrl: '/inventory-api/media/front?variant=thumb',
    caption: 'Front view',
  },
  {
    id: 'back',
    url: '/inventory-api/media/back?variant=medium',
    thumbUrl: '/inventory-api/media/back?variant=thumb',
    caption: null,
  },
];

function renderSection(items: readonly DetailPhoto[], disabledReason?: string): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PhotosSection
        itemId="item-1"
        itemName="Desk lamp"
        photos={items}
        disabledReason={disabledReason}
      />
    </QueryClientProvider>
  );
}

describe('PhotosSection', () => {
  it('renders the empty state and keeps the add action available', () => {
    renderSection([]);

    expect(screen.getByRole('status')).toHaveTextContent('No photos yet');
    expect(screen.getByRole('button', { name: 'Add photo' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('renders the item-detail photo model as a gallery', () => {
    renderSection(photos);

    expect(screen.getByRole('button', { name: 'Show image 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show image 2' })).toBeInTheDocument();
    expect(screen.getAllByAltText('Front view')[0]).toHaveAttribute('src', photos[0]?.url);
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show image 2' }));
    expect(screen.getAllByAltText('Desk lamp photo 2')[0]).toHaveAttribute('src', photos[1]?.url);
  });

  it('explains when a photo cannot be loaded', () => {
    renderSection([photos[0]!]);

    fireEvent.error(screen.getByAltText('Front view'));

    expect(screen.getByText('Photo did not load')).toBeInTheDocument();
    expect(
      screen.getByText('The file is missing or damaged. Replace it or remove it.')
    ).toBeInTheDocument();
  });

  it('disables the add action for a read-only item', () => {
    renderSection([], 'Nothing can change on this item.');

    const add = screen.getByRole('button', { name: 'Add photo' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(add);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
