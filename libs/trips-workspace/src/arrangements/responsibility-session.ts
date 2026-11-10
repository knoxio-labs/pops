import type { ContactChooserIntent } from '@pops/pillar-sdk';

import type { ArrangementResponsibility } from './types';

/** Immutable source write and optional owner picker receipt belonging to one explicit operation. */
export interface ResponsibilityWrite {
  readonly source: ArrangementResponsibility;
  readonly value: ArrangementResponsibility['responsibility'];
  readonly picker?: ContactChooserIntent;
}
/** A GET cannot turn an uncertain PUT into an acknowledged write. */
export type ResponsibilityOperation =
  | { kind: 'ready' }
  | { kind: 'saving'; write: ResponsibilityWrite }
  | { kind: 'uncertain'; write: ResponsibilityWrite; error: unknown }
  | { kind: 'acknowledged'; write: ResponsibilityWrite; receipt: ArrangementResponsibility };

/** Retained per-target operations survive view unmounts without borrowing another writer's source state. */
export class ResponsibilitySession {
  private state: ResponsibilityOperation = { kind: 'ready' };
  private history: ResponsibilityOperation[] = [];
  private listeners = new Set<() => void>();

  /** Read the stable snapshot for the current explicit operation. */
  read = (): ResponsibilityOperation => this.state;

  /** Observe operation changes, including outcomes delivered while its view is unmounted. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(state: ResponsibilityOperation): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  /** Start a new write or retry only the exact retained uncertain operation. */
  claim(write: ResponsibilityWrite): boolean {
    if (this.state.kind === 'saving') return false;
    if (this.state.kind === 'uncertain' && this.state.write !== write) return false;
    this.update({ kind: 'saving', write });
    return true;
  }

  /** Keep the exact successful response as application proof; field equality from a later read is insufficient. */
  acknowledge(write: ResponsibilityWrite, receipt: ArrangementResponsibility): boolean {
    if (this.state.kind !== 'saving' || this.state.write !== write) return false;
    const outcome: ResponsibilityOperation = { kind: 'acknowledged', write, receipt };
    this.history.push(outcome);
    this.update(outcome);
    return true;
  }

  /** Retain the original payload and revision after a failed or lost response. */
  fail(write: ResponsibilityWrite, error: unknown): void {
    if (this.state.kind !== 'saving' || this.state.write !== write) return;
    this.update({ kind: 'uncertain', write, error });
  }

  /** Explicitly abandon the active unknown outcome without claiming it succeeded or deleting its receipt. */
  reconcile(): ResponsibilityWrite | undefined {
    if (this.state.kind !== 'uncertain') return undefined;
    const write = this.state.write;
    this.history.push(this.state);
    this.update({ kind: 'ready' });
    return write;
  }
}
