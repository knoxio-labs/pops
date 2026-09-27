import type { RepairActionId } from '../sync-model.js';

/** The local result shown after a web action has completed. */
export type RepairOutcome =
  | { kind: 'applied'; message: string; at: string }
  | { kind: 'follow-up'; message: string; at: string };

/** The web action that a Sync page may associate with a later device resolution. */
export interface AppliedRepair {
  caseId: string;
  kind: string;
  actionId: RepairActionId;
  undo: (() => Promise<void>) | null;
}
