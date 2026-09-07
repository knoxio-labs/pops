import { useCallback, useState } from 'react';

import { movePart, nextPartId, receiptMediaType, removePartAt } from './parts';
import { EMPTY_STAGING, stage, withRefused, type Staging } from './staging';

import type { StagedPart } from '@/fixtures/purchases-receipt-intake';

export interface ReceiptStaging {
  readonly staging: Staging;
  addFiles: (chosen: File[]) => void;
  refuse: (name: string) => void;
  addText: (text: string) => void;
  remove: (index: number) => void;
  move: (index: number, offset: -1 | 1) => void;
  clear: () => void;
}

/**
 * The parts of one receipt, as they are gathered on this canvas.
 *
 * The playground stages real chosen files — so the drop zone, the reorder
 * controls and the problem list all behave — but never reads their bytes:
 * nothing here is submitted anywhere, so only what {@link StagedPart} renders
 * (name, media type, size) is kept.
 */
export function useReceiptStaging(initial: Staging = EMPTY_STAGING): ReceiptStaging {
  const [staging, setStaging] = useState<Staging>(initial);

  const addFiles = useCallback((chosen: File[]): void => {
    const staged: StagedPart[] = [];
    const rejected: string[] = [];
    for (const file of chosen) {
      const mediaType = receiptMediaType(file);
      if (mediaType === null) {
        rejected.push(file.name);
        continue;
      }
      staged.push({ id: nextPartId(), name: file.name, mediaType, byteLength: file.size });
    }
    setStaging((current) => stage(current, { staged, rejected }));
  }, []);

  const refuse = useCallback((name: string): void => {
    setStaging((current) => withRefused(current, [name]));
  }, []);

  const addText = useCallback((text: string): void => {
    setStaging((current) =>
      stage(current, {
        staged: [
          {
            id: nextPartId(),
            name: null,
            mediaType: 'text/plain',
            byteLength: new Blob([text]).size,
          },
        ],
        rejected: [],
      })
    );
  }, []);

  const remove = useCallback((index: number): void => {
    setStaging((current) => ({ parts: removePartAt(current.parts, index), problems: [] }));
  }, []);

  const move = useCallback((index: number, offset: -1 | 1): void => {
    setStaging((current) => ({ parts: movePart(current.parts, index, offset), problems: [] }));
  }, []);

  const clear = useCallback((): void => {
    setStaging(EMPTY_STAGING);
  }, []);

  return { staging, addFiles, refuse, addText, remove, move, clear };
}
