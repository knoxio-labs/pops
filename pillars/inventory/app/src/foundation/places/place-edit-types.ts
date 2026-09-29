import type { DeleteMode } from './delete-plan.js';

/** A place deletion waiting for its outcome to be confirmed. */
export interface PendingDelete {
  placeId: string;
  mode: DeleteMode;
}
