/** The local result shown after a web action has completed. */
export type RepairOutcome =
  | { kind: 'applied'; message: string; at: string }
  | { kind: 'follow-up'; message: string; at: string };
