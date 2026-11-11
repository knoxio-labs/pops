import type { Stay } from '../stay/types';

/** An explicit Visit occurrence and checkout-exclusive interval selected by the user. */
export interface GapCaptureIntent {
  readonly visitId: number;
  readonly arrival: string;
  readonly departure: string;
}
/** Source creation receipts remain distinct from subsequent reads or matching foreign records. */
export type GapCaptureOperation =
  | { kind: 'ready' }
  | { kind: 'creating'; intent: GapCaptureIntent }
  | { kind: 'acknowledged'; intent: GapCaptureIntent; source: Stay }
  | { kind: 'uncertain'; intent: GapCaptureIntent; error: unknown };

/** Retain each non-idempotent source operation above view lifetime without losing earlier known or unknown receipts. */
export class GapCaptureSession {
  private state: GapCaptureOperation = Object.freeze({ kind: 'ready' });
  private readonly operations = new Map<string, GapCaptureOperation>();
  private readonly listeners = new Set<() => void>();

  /** Read the stable owned snapshot of the selected explicit intent. */
  readonly read = (): GapCaptureOperation => this.state;
  /** Observe receipts delivered while another owner context or source view is active. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Serialize creates within this owner context while preserving other contexts' independent operations. */
  pending(): boolean {
    return [...this.operations.values()].some((item) => item.kind === 'creating');
  }
  /** Select only the receipt for this explicit interval, without matching any source collection fields. */
  select(intent: GapCaptureIntent): GapCaptureOperation {
    const operation =
      this.operations.get(intentKey(intent)) ?? Object.freeze({ kind: 'ready' } as const);
    this.publish(operation);
    return operation;
  }
  /** Retain an owned source outcome and notify only this exact owner's subscribers. */
  update(next: Exclude<GapCaptureOperation, { kind: 'ready' }>): void {
    const intent = Object.freeze({ ...next.intent });
    const operation = Object.freeze(
      next.kind === 'acknowledged'
        ? { ...next, intent, source: Object.freeze({ ...next.source }) }
        : { ...next, intent }
    );
    this.operations.set(intentKey(intent), operation);
    this.publish(operation);
  }
  /** Explicitly abandon only the currently selected uncertain outcome; this action itself starts no POST. */
  beginNew(): void {
    if (this.state.kind !== 'uncertain') return;
    this.operations.delete(intentKey(this.state.intent));
    this.publish(Object.freeze({ kind: 'ready' }));
  }
  private publish(state: GapCaptureOperation): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
function intentKey(intent: GapCaptureIntent): string {
  return JSON.stringify([intent.visitId, intent.arrival, intent.departure]);
}
