import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import { photosUpload } from '../../inventory-api/index.js';

import type { PhotosUploadData } from '../../inventory-api/types.gen.js';

/** The supported photo-entry modes. */
export type PhotoUploadMode = 'create' | 'edit';

/** One browser file tracked while the inventory photo endpoint processes it. */
export interface PhotoUploadEntry {
  localId: string;
  file: File;
  status: 'staged' | 'uploading' | 'attached' | 'failed';
  reason?: string;
}

/** The small upload queue contract consumed by item forms and Sync repair actions. */
export interface PhotoUploads {
  add(files: readonly File[]): Promise<void>;
  queue: readonly PhotoUploadEntry[];
  refused: readonly string[];
}

const PHOTO_BYTE_LIMIT = 20 * 1024 * 1024;

function isImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

function refusalFor(file: File): string | null {
  if (file.size > PHOTO_BYTE_LIMIT) return `${file.name} is over 20 MB.`;
  if (!isImage(file)) return `${file.name} is not an image.`;
  return null;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected photo could not be read.'));
        return;
      }
      const separator = reader.result.indexOf(',');
      resolve(separator === -1 ? reader.result : reader.result.slice(separator + 1));
    };
    reader.onerror = () => reject(new Error('The selected photo could not be read.'));
    reader.readAsDataURL(file);
  });
}

function uploadBody(fileBase64: string, sortOrder: number): PhotosUploadData['body'] {
  return { fileBase64, sortOrder };
}

/** Uploads validated browser images and reports refused files without queueing them. */
export function usePhotoUploads(
  mode: PhotoUploadMode,
  itemId: string,
  existingPhotoCount: number
): PhotoUploads {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<PhotoUploadEntry[]>([]);
  const [refused, setRefused] = useState<string[]>([]);

  const add = useCallback(
    async (files: readonly File[]): Promise<void> => {
      const refusals = files
        .map((file) => refusalFor(file))
        .filter((reason): reason is string => reason !== null);
      if (refusals.length > 0) {
        setRefused(refusals);
        return;
      }
      setRefused([]);
      const start = mode === 'edit' ? existingPhotoCount : 0;
      const entries = files.map((file, index) => ({
        localId: `${Date.now()}-${index}-${file.name}`,
        file,
        status: 'uploading' as const,
      }));
      setQueue((current) => [...current, ...entries]);

      await Promise.all(
        entries.map(async (entry, index) => {
          try {
            const fileBase64 = await readBase64(entry.file);
            await unwrap(
              await photosUpload({
                path: { itemId },
                body: uploadBody(fileBase64, start + index),
              })
            );
            setQueue((current) =>
              current.map((candidate) =>
                candidate.localId === entry.localId
                  ? { ...candidate, status: 'attached' }
                  : candidate
              )
            );
            void queryClient.invalidateQueries({ queryKey: ['inventory', 'web'] });
          } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : 'The upload failed.';
            setQueue((current) =>
              current.map((candidate) =>
                candidate.localId === entry.localId
                  ? { ...candidate, status: 'failed', reason }
                  : candidate
              )
            );
          }
        })
      );
    },
    [existingPhotoCount, itemId, mode, queryClient]
  );

  return { add, queue, refused };
}
