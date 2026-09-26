import { Camera } from 'lucide-react';

import { Skeleton } from '@pops/ui';

import { PhotoGallery } from '../../components/PhotoGallery';
import { SortablePhotoGrid } from '../../components/SortablePhotoGrid';

import type { DetailPhoto } from '../../foundation/item-page';

/** The photos block used at the top of the facts rail. */
export function PhotosSection({
  photos,
  isLoading,
  isReordering,
  readOnly,
  onReorder,
}: {
  photos: readonly DetailPhoto[];
  isLoading: boolean;
  isReordering: boolean;
  readOnly: boolean;
  onReorder: (orderedIds: number[]) => void;
}) {
  if (isLoading) {
    return (
      <section aria-label="Photos" className="flex shrink-0 flex-col gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="size-4" aria-hidden />
          Photos
        </h2>
        <Skeleton className="aspect-video w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section aria-label="Photos" className="flex shrink-0 flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Camera className="size-4" aria-hidden />
        Photos
        {photos.length > 0 ? (
          <span className="text-xs font-normal text-muted-foreground">{photos.length}</span>
        ) : null}
      </h2>
      <PhotoGallery photos={[...photos]} baseUrl="/api/inventory/photos" />
      {!readOnly && photos.length > 1 ? (
        <SortablePhotoGrid
          photos={[...photos]}
          baseUrl="/api/inventory/photos"
          isReordering={isReordering}
          onReorder={onReorder}
        />
      ) : null}
      {readOnly ? (
        <p className="text-xs text-muted-foreground">Photos are read-only for destroyed items.</p>
      ) : null}
    </section>
  );
}
