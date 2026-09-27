import { StoreHereSheet } from '../../foundation/store-here/store-here-sheet.js';

import type { ReactElement } from 'react';

import type { StoreHereTarget } from '../../foundation/model/contracts.js';

/** Props for the live Store here sheet attached to an item-detail container. */
export interface DetailStoreHereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StoreHereTarget;
  offline: boolean;
}

/** Renders the Store here sheet with placement reads and its live mutations. */
export function DetailStoreHereSheet({
  open,
  onOpenChange,
  target,
  offline,
}: DetailStoreHereSheetProps): ReactElement {
  return (
    <StoreHereSheet open={open} onOpenChange={onOpenChange} target={target} offline={offline} />
  );
}
