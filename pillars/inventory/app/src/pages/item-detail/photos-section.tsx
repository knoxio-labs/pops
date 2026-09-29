import { Camera } from 'lucide-react';

import { EmptyState, ImageGallery } from '@pops/ui';

import { PaneLabel } from '../../foundation/item-page/section-parts';
import { PhotoAddDialog } from '../../foundation/photos/photo-add-dialog';

import type { ReactElement } from 'react';

import type { DetailPhoto } from './detail-model';

/** Props for the item-detail photo section. */
export interface PhotosSectionProps {
  readonly itemId: string;
  readonly itemName: string;
  readonly photos: readonly DetailPhoto[];
  readonly disabledReason?: string;
}

/** Renders the item-detail gallery and its add-photo action. */
export function PhotosSection({
  itemId,
  itemName,
  photos,
  disabledReason,
}: PhotosSectionProps): ReactElement {
  const items = photos.map((photo, index) => ({
    id: photo.id,
    src: photo.url,
    caption: photo.caption ?? undefined,
    alt: photo.caption ?? `${itemName} photo ${index + 1}`,
  }));
  return (
    <section
      aria-label="Photos"
      className="flex w-full shrink-0 flex-col gap-3"
      data-item-id={itemId}
      title={disabledReason}
    >
      <PaneLabel
        trailing={
          <PhotoAddDialog
            itemId={itemId}
            itemName={itemName}
            existingPhotoCount={photos.length}
            disabledReason={disabledReason}
          />
        }
      >
        <span className="inline-flex items-center gap-2">
          <Camera className="size-4" aria-hidden />
          Photos
          {photos.length > 0 ? (
            <span className="font-normal tabular-nums">{photos.length}</span>
          ) : null}
        </span>
      </PaneLabel>
      {items.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No photos yet"
          description="Add a photo to keep this item easy to identify."
          size="sm"
          className="rounded-lg border bg-muted/30"
        />
      ) : (
        <ImageGallery items={items} className="min-w-0" />
      )}
    </section>
  );
}
