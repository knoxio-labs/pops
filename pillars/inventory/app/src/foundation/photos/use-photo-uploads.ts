import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useImageProcessor } from '../../hooks/useImageProcessor';
import {
  addPhotos,
  photoRefusal,
  removePhoto,
  retryPhoto,
  startStagedUploads,
  type PhotoUpload,
} from './photo-queue';
import { toPhotoFile, uploadPhoto } from './photo-upload-operations';
import { usePhotoUploadState, type PhotoUploadState } from './photo-upload-state';

const WEB_QUERY_KEY = ['inventory', 'web'] as const;

/** The queue and upload operations exposed to an item form. */
export interface PhotoUploads {
  readonly queue: PhotoUpload[];
  readonly refused: string[];
  /** Adds files from the picker or drop target. */
  readonly add: (files: readonly File[]) => void;
  /** Removes one staged or failed photo and its retained file. */
  readonly remove: (localId: string) => void;
  /** Retries one failed photo when the edited item already exists. */
  readonly retry: (localId: string) => void;
  /** Uploads staged and in-flight photos for the item, including files added while it runs. */
  readonly flush: (itemId: string) => Promise<{ attached: number; queue: PhotoUpload[] }>;
  /** Clears queue state and retained files for Save and start another. */
  readonly reset: () => void;
  readonly stagedCount: number;
  readonly attachedCount: number;
}

interface PhotoUploadContext {
  readonly mode: 'create' | 'edit';
  readonly itemId: string | null;
  readonly processFiles: (files: File[]) => Promise<Array<{ processed: Blob }>>;
  readonly queryClient: QueryClient;
  readonly state: PhotoUploadState;
}

function settledUpload(context: PhotoUploadContext, localId: string): void {
  context.state.pendingRef.current.delete(localId);
  if (
    context.mode === 'edit' &&
    !context.state.flushingRef.current &&
    context.state.pendingRef.current.size === 0 &&
    !context.state.queueRef.current.some((photo) => photo.status.kind === 'uploading')
  ) {
    void context.queryClient.invalidateQueries({ queryKey: WEB_QUERY_KEY });
  }
}

function startUpload(
  context: PhotoUploadContext,
  localId: string,
  targetId: string
): Promise<boolean> {
  const { state } = context;
  const pending = state.pendingRef.current.get(localId);
  if (pending !== undefined) return pending;
  const file = state.filesRef.current.get(localId);
  if (file === undefined) return Promise.resolve(false);
  const operation = uploadPhoto({
    file,
    itemId: targetId,
    position: state.reservePosition(),
    processFiles: context.processFiles,
    setStatus: state.setStatus,
    localId,
  });
  state.pendingRef.current.set(localId, operation);
  void operation.then(
    () => settledUpload(context, localId),
    () => state.pendingRef.current.delete(localId)
  );
  return operation;
}

function addPhotoFiles(context: PhotoUploadContext, files: readonly File[]): void {
  const photoFiles = files.map((file) => {
    const localId = crypto.randomUUID();
    context.state.filesRef.current.set(localId, file);
    return toPhotoFile(file, localId);
  });
  const result = addPhotos(context.state.queueRef.current, photoFiles, context.mode);
  for (const photoFile of photoFiles) {
    if (photoRefusal(photoFile) !== null) context.state.filesRef.current.delete(photoFile.localId);
  }
  const added = result.queue.slice(context.state.queueRef.current.length);
  context.state.setQueueValue(result.queue);
  context.state.setRefusedValue([...context.state.refusedRef.current, ...result.refused]);
  if (context.mode === 'edit' && context.itemId !== null) {
    for (const photo of added) void startUpload(context, photo.localId, context.itemId);
  }
}

function removePhotoFile(context: PhotoUploadContext, localId: string): void {
  context.state.filesRef.current.delete(localId);
  context.state.setQueueValue(removePhoto(context.state.queueRef.current, localId));
}

function retryPhotoFile(context: PhotoUploadContext, localId: string): void {
  context.state.setQueueValue(retryPhoto(context.state.queueRef.current, localId));
  if (context.mode === 'edit' && context.itemId !== null)
    void startUpload(context, localId, context.itemId);
}

function flushPhotos(
  context: PhotoUploadContext,
  targetId: string
): Promise<{ attached: number; queue: PhotoUpload[] }> {
  const { state } = context;
  const currentFlush = state.flushRef.current;
  if (currentFlush !== null) return currentFlush;
  const operation = (async (): Promise<{ attached: number; queue: PhotoUpload[] }> => {
    state.flushingRef.current = true;
    let attached = 0;
    try {
      while (true) {
        const staged = state.queueRef.current.filter((photo) => photo.status.kind === 'staged');
        if (staged.length > 0) state.setQueueValue(startStagedUploads(state.queueRef.current));
        for (const photo of staged) void startUpload(context, photo.localId, targetId);
        const pending = [...state.pendingRef.current.values()];
        if (pending.length > 0) {
          const results = await Promise.all(pending);
          attached += results.filter(Boolean).length;
        }
        const active = state.queueRef.current.some(
          (photo) => photo.status.kind === 'staged' || photo.status.kind === 'uploading'
        );
        if (!active) break;
      }
      void context.queryClient.invalidateQueries({ queryKey: WEB_QUERY_KEY });
      return { attached, queue: state.queueRef.current };
    } finally {
      state.flushingRef.current = false;
    }
  })();
  state.flushRef.current = operation;
  void operation.then(
    () => {
      if (state.flushRef.current === operation) state.flushRef.current = null;
    },
    () => {
      if (state.flushRef.current === operation) state.flushRef.current = null;
    }
  );
  return operation;
}

/** Manages item-detail photo state, staged create uploads and immediate edit uploads. */
export function usePhotoUploads(
  mode: 'create' | 'edit',
  itemId: string | null,
  existingPhotoCount: number
): PhotoUploads {
  const queryClient = useQueryClient();
  const { processFiles } = useImageProcessor();
  const state = usePhotoUploadState(existingPhotoCount);
  const context: PhotoUploadContext = { mode, itemId, processFiles, queryClient, state };
  const stagedCount = state.queue.filter((photo) => photo.status.kind === 'staged').length;
  const attachedCount = state.queue.filter((photo) => photo.status.kind === 'attached').length;
  return {
    queue: state.queue,
    refused: state.refused,
    add: (files) => addPhotoFiles(context, files),
    remove: (localId) => removePhotoFile(context, localId),
    retry: (localId) => retryPhotoFile(context, localId),
    flush: (targetId) => flushPhotos(context, targetId),
    reset: state.reset,
    stagedCount,
    attachedCount,
  };
}
