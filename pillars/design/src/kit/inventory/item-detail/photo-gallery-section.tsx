import { PhotoGallery, type PhotoItem } from '@/kit/inventory/photos/photo-gallery';
import { SortablePhotoGrid } from '@/kit/inventory/photos/sortable-photo-grid';
import { Camera } from 'lucide-react';

import { Skeleton } from '@pops/ui';

interface PhotoGallerySectionProps {
  photos: PhotoItem[];
  isLoading: boolean;
  isReordering: boolean;
  onReorder: (orderedIds: number[]) => void;
}

export function PhotoGallerySection({
  photos,
  isLoading,
  isReordering,
  onReorder,
}: PhotoGallerySectionProps) {
  if (isLoading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Camera className="h-5 w-5" />
          Photos
        </h2>
        <Skeleton className="h-48 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Camera className="h-5 w-5" />
        Photos
        {photos.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">({photos.length})</span>
        )}
      </h2>

      <PhotoGallery photos={photos} />

      {photos.length > 1 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Drag to reorder</p>
          <SortablePhotoGrid photos={photos} isReordering={isReordering} onReorder={onReorder} />
        </div>
      )}
    </section>
  );
}
