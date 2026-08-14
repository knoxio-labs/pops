import { useCallback, useRef, useState } from 'react';

import { encodeText } from './encode.js';
import { movePart, nextPartId, removePartAt } from './parts.js';
import { encodeBatch, EMPTY_STAGING, stage, withRefused, type Staging } from './staging.js';

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
 * The parts of one receipt, as they are gathered.
 *
 * Every update goes through {@link stage} or a pure list operation, so the
 * order the reader sees is the order that goes on the wire — the server reads
 * the parts top to bottom as one document.
 */
export function useReceiptStaging(): ReceiptStaging {
  const [staging, setStaging] = useState<Staging>(EMPTY_STAGING);
  /**
   * Staging is chained so batches land in the order they were added, whatever
   * order they finish encoding in. Without it a small batch dropped after a
   * large one can encode first and be staged ahead of it, silently reordering
   * a document whose order is the whole point. The encode itself still starts
   * immediately and runs in parallel — only the staging waits.
   */
  const staged = useRef<Promise<void>>(Promise.resolve());

  const addFiles = useCallback((chosen: File[]): void => {
    const encoding = encodeBatch(chosen);
    staged.current = staged.current.then(async () => {
      const batch = await encoding;
      setStaging((current) => stage(current, batch));
    });
  }, []);

  /**
   * A file the drop zone turned away on its own accept filter, before anything
   * here saw it.
   *
   * They arrive one at a time and are folded together on the next microtask:
   * staging replaces its problems per batch, so a refusal reported on its own
   * would be wiped by the staging of whatever else the same gesture carried.
   */
  const refused = useRef<string[]>([]);
  const refuse = useCallback((name: string): void => {
    if (refused.current.length === 0) {
      queueMicrotask(() => {
        const names = refused.current.splice(0);
        staged.current = staged.current.then(() => {
          setStaging((current) => withRefused(current, names));
        });
      });
    }
    refused.current.push(name);
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

  // A complaint describes the files of the add that raised it. Once the reader
  // has edited the list it is about a state that no longer exists, so it is
  // dropped rather than left accusing a file that has since been dealt with.
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
