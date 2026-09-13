import { PhotoUpload, type UploadedFile } from '@/kit/inventory/photos/photo-upload';
import { SortablePhotoGrid } from '@/kit/inventory/photos/sortable-photo-grid';
/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/sections/PhotoUploadSection.tsx`,
 * composing the already-ported `@/kit/inventory/photos` controls.
 */
import { ImageIcon, Trash2 } from 'lucide-react';

import { Button } from '@pops/ui';

import type { PhotoItem } from '@/kit/inventory/photos/photo-gallery';

export interface PhotoUploadSectionProps {
  isEditMode: boolean;
  existingPhotos: PhotoItem[];
  uploadFiles: UploadedFile[];
  imageProcessing: boolean;
  isReordering: boolean;
  deleteConfirmId: number | null;
  isDeleting: boolean;
  onFilesSelected: (files: File[]) => Promise<void>;
  onRemoveUpload: (localId: string) => void;
  onDeletePhoto: (photoId: number) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onReorder: (orderedIds: number[]) => void;
}

export function PhotoUploadSection({
  isEditMode,
  existingPhotos,
  uploadFiles,
  imageProcessing,
  isReordering,
  deleteConfirmId,
  isDeleting,
  onFilesSelected,
  onRemoveUpload,
  onDeletePhoto,
  onConfirmDelete,
  onCancelDelete,
  onReorder,
}: PhotoUploadSectionProps) {
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <ImageIcon className="h-5 w-5 text-app-accent" />
        Photos
      </h2>

      {isEditMode && existingPhotos.length > 0 && (
        <SortablePhotoGrid
          photos={existingPhotos}
          onReorder={onReorder}
          onDelete={onDeletePhoto}
          isReordering={isReordering}
        />
      )}

      {deleteConfirmId !== null && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm flex-1">Delete this photo? This cannot be undone.</p>
          <Button type="button" variant="outline" size="sm" onClick={onCancelDelete}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
            onClick={onConfirmDelete}
            loading={isDeleting}
            loadingText="Deleting..."
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
          </Button>
        </div>
      )}

      <PhotoUpload
        onFilesSelected={(files) => void onFilesSelected(files)}
        files={uploadFiles}
        onRemove={onRemoveUpload}
        disabled={imageProcessing}
      />
    </section>
  );
}
