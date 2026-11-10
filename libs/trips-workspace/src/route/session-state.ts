import type { RouteOperation, RouteReceipt, RouteView } from './types';

/** A rejected request is distinct from an outcome whose commit status is unknown. */
export interface RouteFailure {
  readonly operation: RouteOperation;
  readonly kind: 'rejected' | 'uncertain';
  readonly error: unknown;
}
/** Stable owned reads and writes; only matched POST/replay responses contribute operation receipts. */
export interface RouteSessionSnapshot {
  readonly view: RouteView | undefined;
  readonly pending: RouteOperation | undefined;
  readonly failure: RouteFailure | undefined;
  readonly receipts: readonly RouteReceipt[];
  readonly canUndo: boolean;
  readonly reading: boolean;
  readonly readError: Error | null;
}
