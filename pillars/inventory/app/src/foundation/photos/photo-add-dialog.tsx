import { Camera } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { VerbButton } from '../item-page/verb-button';
import { PhotosField } from './photos-field';
import { usePhotoUploads, type PhotoUploads } from './use-photo-uploads';

import type { ReactElement } from 'react';

function hasUploadingPhoto(uploads: PhotoUploads): boolean {
  return uploads.queue.some((photo) => photo.status.kind === 'uploading');
}

/** Props for the item-detail photo upload dialog. */
export interface PhotoAddDialogProps {
  readonly itemId: string;
  readonly itemName: string;
  readonly existingPhotoCount: number;
  readonly disabledReason?: string;
}

/** Opens the shared photo queue for an existing inventory item. */
export function PhotoAddDialog({
  itemId,
  itemName,
  existingPhotoCount,
  disabledReason,
}: PhotoAddDialogProps): ReactElement {
  const [open, setOpen] = useState(false);
  const uploads = usePhotoUploads('edit', itemId, existingPhotoCount);
  const uploading = hasUploadingPhoto(uploads);

  const close = (nextOpen: boolean): void => {
    if (!nextOpen && uploading) return;
    setOpen(nextOpen);
    if (!nextOpen) uploads.reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <VerbButton
        label="Add photo"
        icon={Camera}
        disabledReason={disabledReason}
        onClick={() => setOpen(true)}
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add photos to {itemName}</DialogTitle>
          <DialogDescription>
            Photos upload immediately. JPEG, PNG or HEIC files up to 20 MB are accepted.
          </DialogDescription>
        </DialogHeader>
        <PhotosField
          photos={uploads.queue}
          refused={uploads.refused}
          onRemove={uploads.remove}
          onRetry={uploads.retry}
          onFiles={uploads.add}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => close(false)} disabled={uploading}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
