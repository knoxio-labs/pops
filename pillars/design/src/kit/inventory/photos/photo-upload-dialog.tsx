/**
 * Adding photos to an existing item from disk (web has no camera path): a
 * drop zone plus the queue of files in flight, in a dialog so the gallery
 * keeps its space until someone is actually adding.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileUpload,
} from '@pops/ui';

import { UploadedFileRow } from './uploaded-file-row';

import type { UploadedFile } from './uploaded-file';

/** Props for {@link PhotoUploadDialog}. */
export interface PhotoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  queue?: readonly UploadedFile[];
  onFilesSelected?: (files: File[]) => void;
}

const NO_FILES: readonly UploadedFile[] = [];
const ignoreFiles = (): void => undefined;

/** The add-photos dialog. */
export function PhotoUploadDialog({
  open,
  onOpenChange,
  itemName,
  queue = NO_FILES,
  onFilesSelected = ignoreFiles,
}: PhotoUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add photos of {itemName}</DialogTitle>
          <DialogDescription>
            JPEG, PNG or HEIC up to 10 MB each. They upload as soon as you drop them.
          </DialogDescription>
        </DialogHeader>
        <FileUpload
          multiple
          accept="image/*,.heic,.heif"
          maxSize={10 * 1024 * 1024}
          onFilesSelected={onFilesSelected}
          acceptHint={null}
        />
        {queue.length > 0 ? (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {queue.map((file) => (
              <UploadedFileRow key={file.localId} f={file} />
            ))}
          </div>
        ) : null}
        <DialogFooter className="text-xs text-muted-foreground sm:justify-start">
          The first photo is the one lists show. Reorder them on the item page.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
