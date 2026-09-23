import { useEffect, useEffectEvent, useRef } from 'react';

import type { CatalogueOperation } from './types';

/** Requests a preview whenever the rendered form operation changes. */
export function useOperationPreview(
  operation: CatalogueOperation | null,
  onPreview: ((operation: CatalogueOperation) => void) | undefined
): void {
  const operationKey = operation === null ? null : JSON.stringify(operation);
  const initialOperationKey = useRef(operationKey);
  const previewLatest = useEffectEvent(() => {
    if (operation !== null) onPreview?.(operation);
  });

  useEffect(() => {
    if (operationKey === initialOperationKey.current) return;
    previewLatest();
  }, [operationKey]);
}
