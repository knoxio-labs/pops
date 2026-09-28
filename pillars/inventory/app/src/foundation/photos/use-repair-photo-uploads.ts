import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import { photosUpload } from '../../inventory-api/index.js';

import type { PhotosUploadData } from '../../inventory-api/types.gen.js';

const PHOTO_BYTE_LIMIT = 20 * 1024 * 1024;

/** One browser file tracked while a Sync repair upload is being processed. */
export interface RepairPhotoUploadEntry {
  readonly localId: string;
  readonly file: File;
  readonly status: 'uploading' | 'attached' | 'failed';
  readonly reason?: string;
}

/** The result for one file accepted by the Sync repair upload action. */
export type RepairPhotoUploadResult =
  | { readonly fileName: string; readonly status: 'attached' }
  | { readonly fileName: string; readonly status: 'refused' | 'failed'; readonly reason: string };

/** The upload contract consumed by Sync repair actions. */
export interface RepairPhotoUploads {
  readonly add: (files: readonly File[]) => Promise<readonly RepairPhotoUploadResult[]>;
  readonly queue: readonly RepairPhotoUploadEntry[];
  readonly refused: readonly string[];
}

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

interface UploadContext {
  readonly itemId: string;
  readonly start: number;
  readonly queryClient: ReturnType<typeof useQueryClient>;
  readonly setQueue: (
    update: (current: RepairPhotoUploadEntry[]) => RepairPhotoUploadEntry[]
  ) => void;
}

async function uploadEntry(
  entry: RepairPhotoUploadEntry,
  index: number,
  context: UploadContext
): Promise<RepairPhotoUploadResult> {
  try {
    const fileBase64 = await readBase64(entry.file);
    await unwrap(
      await photosUpload({
        path: { itemId: context.itemId },
        body: uploadBody(fileBase64, context.start + index),
      })
    );
    context.setQueue((current) =>
      current.map((candidate) =>
        candidate.localId === entry.localId ? { ...candidate, status: 'attached' } : candidate
      )
    );
    void context.queryClient.invalidateQueries({ queryKey: ['inventory', 'web'] });
    return { fileName: entry.file.name, status: 'attached' };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'The upload failed.';
    context.setQueue((current) =>
      current.map((candidate) =>
        candidate.localId === entry.localId ? { ...candidate, status: 'failed', reason } : candidate
      )
    );
    return { fileName: entry.file.name, status: 'failed', reason };
  }
}

/** Uploads validated browser images for a Sync repair action. */
export function useRepairPhotoUploads(
  itemId: string,
  existingPhotoCount: number
): RepairPhotoUploads {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<RepairPhotoUploadEntry[]>([]);
  const [refused, setRefused] = useState<string[]>([]);

  const add = useCallback(
    async (files: readonly File[]): Promise<readonly RepairPhotoUploadResult[]> => {
      const results = files.map((file) => {
        const reason = refusalFor(file);
        return reason === null
          ? null
          : ({
              fileName: file.name,
              status: 'refused' as const,
              reason,
            } satisfies RepairPhotoUploadResult);
      });
      setRefused(
        results.flatMap((result) => (result?.status === 'refused' ? [result.reason] : []))
      );
      const inputIndexes = files.flatMap((file, index) =>
        results[index] === null ? [[file, index] as const] : []
      );
      const entries = inputIndexes.map(([file]) => ({
        localId: crypto.randomUUID(),
        file,
        status: 'uploading' as const,
      }));
      setQueue((current) => [...current, ...entries]);
      const uploaded = await Promise.all(
        entries.map((entry, index) =>
          uploadEntry(entry, index, {
            itemId,
            start: existingPhotoCount,
            queryClient,
            setQueue,
          })
        )
      );
      const uploadedByInput = new Map(
        inputIndexes.map(([, inputIndex], index) => [inputIndex, uploaded[index]])
      );
      return results.map((result, index) => {
        if (result !== null) return result;
        const uploadedResult = uploadedByInput.get(index);
        if (uploadedResult === undefined) {
          throw new Error('The selected photo could not be uploaded.');
        }
        return uploadedResult;
      });
    },
    [existingPhotoCount, itemId, queryClient]
  );

  return { add, queue, refused };
}
