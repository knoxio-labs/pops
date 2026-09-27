import { useCallback, useRef, useState } from 'react';

import { type PhotoStatus, type PhotoUpload } from './photo-queue';

interface PhotoRef<T> {
  current: T;
}

/** Mutable queue state shared by the photo actions and upload worker. */
export interface PhotoUploadState {
  readonly queue: PhotoUpload[];
  readonly refused: string[];
  readonly queueRef: PhotoRef<PhotoUpload[]>;
  readonly refusedRef: PhotoRef<string[]>;
  readonly filesRef: PhotoRef<Map<string, File>>;
  readonly pendingRef: PhotoRef<Map<string, Promise<boolean>>>;
  readonly flushRef: PhotoRef<Promise<{ attached: number; queue: PhotoUpload[] }> | null>;
  readonly flushingRef: PhotoRef<boolean>;
  readonly setQueueValue: (next: PhotoUpload[]) => void;
  readonly setRefusedValue: (next: string[]) => void;
  readonly setStatus: (localId: string, status: PhotoStatus) => void;
  readonly reservePosition: () => number;
  readonly reset: () => void;
}

function updateStatus(
  queue: readonly PhotoUpload[],
  localId: string,
  status: PhotoStatus
): PhotoUpload[] {
  return queue.map((photo) => (photo.localId === localId ? { ...photo, status } : photo));
}

/** Owns mutable queue refs and React state used by item-form photo actions. */
export function usePhotoUploadState(existingPhotoCount: number): PhotoUploadState {
  const [queue, setQueue] = useState<PhotoUpload[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const queueRef = useRef<PhotoUpload[]>([]);
  const refusedRef = useRef<string[]>([]);
  const filesRef = useRef(new Map<string, File>());
  const pendingRef = useRef(new Map<string, Promise<boolean>>());
  const flushRef = useRef<Promise<{ attached: number; queue: PhotoUpload[] }> | null>(null);
  const flushingRef = useRef(false);
  const lastPositionRef = useRef(-1);
  const setQueueValue = useCallback((next: PhotoUpload[]): void => {
    queueRef.current = next;
    setQueue(next);
  }, []);
  const setRefusedValue = useCallback((next: string[]): void => {
    refusedRef.current = next;
    setRefused(next);
  }, []);
  const setStatus = useCallback(
    (localId: string, status: PhotoStatus): void => {
      setQueueValue(updateStatus(queueRef.current, localId, status));
    },
    [setQueueValue]
  );
  const reservePosition = useCallback((): number => {
    lastPositionRef.current = Math.max(existingPhotoCount, lastPositionRef.current + 1);
    return lastPositionRef.current;
  }, [existingPhotoCount]);
  const reset = useCallback((): void => {
    filesRef.current.clear();
    pendingRef.current.clear();
    lastPositionRef.current = -1;
    setQueueValue([]);
    setRefusedValue([]);
  }, [setQueueValue, setRefusedValue]);
  return {
    queue,
    refused,
    queueRef,
    refusedRef,
    filesRef,
    pendingRef,
    flushRef,
    flushingRef,
    setQueueValue,
    setRefusedValue,
    setStatus,
    reservePosition,
    reset,
  };
}
