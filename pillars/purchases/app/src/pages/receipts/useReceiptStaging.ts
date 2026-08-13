import { useCallback, useState } from 'react';

import { encodeText } from './encode.js';
import { movePart, nextPartId, removePartAt } from './parts.js';
import { encodeBatch, EMPTY_STAGING, stage, type Staging } from './staging.js';

export interface ReceiptStaging {
  readonly staging: Staging;
  addFiles: (chosen: File[]) => void;
  addText: (text: string) => void;
  remove: (index: number) => void;
  move: (index: number, offset: -1 | 1) => void;
  clear: () => void;
}

/**
 * The parts of one receipt, as they are gathered.
 *
 * Every update goes through {@link stage} or a pure list operation, so the
 * order the reader sees is the order that goes on the wire — the server reads
 * the parts top to bottom as one document.
 */
export function useReceiptStaging(): ReceiptStaging {
  const [staging, setStaging] = useState<Staging>(EMPTY_STAGING);

  const addFiles = useCallback((chosen: File[]): void => {
    void encodeBatch(chosen).then((batch) => {
      setStaging((current) => stage(current, batch));
    });
  }, []);

  const addText = useCallback((text: string): void => {
    setStaging((current) =>
      stage(current, {
        encoded: [
          {
            id: nextPartId(),
            name: null,
            mediaType: 'text/plain',
            dataBase64: encodeText(text),
            byteLength: new Blob([text]).size,
          },
        ],
        rejected: [],
        unreadable: [],
      })
    );
  }, []);

  const remove = useCallback((index: number): void => {
    setStaging((current) => ({
      parts: removePartAt(current.parts, index),
      problems: current.problems,
    }));
  }, []);

  const move = useCallback((index: number, offset: -1 | 1): void => {
    setStaging((current) => ({
      parts: movePart(current.parts, index, offset),
      problems: current.problems,
    }));
  }, []);

  const clear = useCallback((): void => {
    setStaging(EMPTY_STAGING);
  }, []);

  return { staging, addFiles, addText, remove, move, clear };
}
