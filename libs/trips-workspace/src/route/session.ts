import { ApiError } from '@pops/pillar-sdk/client';

import { applyRouteOperation, assertRouteOwner, loadTripRoute, RouteContextError } from './api';
import { ownRouteValue } from './immutable';
import { requireOwnReceipt, routeWithoutAvailability, sameRoute } from './receipt';

import type { RouteSessionSnapshot } from './session-state';
import type {
  RouteCommand,
  RouteEditCommand,
  RouteOperation,
  RouteOperationResult,
  RouteOwner,
  RouteReceipt,
  TripRouteRead,
} from './types';

interface UndoEntry {
  receipt: RouteReceipt;
  revision: number;
}

/** Serialized commands and exact retries retained independently of views and query-cache eviction. */
export class RouteSession {
  private state: RouteSessionSnapshot = Object.freeze({
    view: undefined,
    pending: undefined,
    failure: undefined,
    receipts: Object.freeze([]),
    canUndo: false,
    reading: false,
    readError: null,
  });
  private readonly listeners = new Set<() => void>();
  private history: UndoEntry[] = [];
  private readGeneration = 0;
  private reads = 0;

  /** Original transport context; later caller mutations cannot replace it. */
  readonly owner: RouteOwner;

  /** Capture one effective client/origin/trip for this controller's entire lifetime. */
  constructor(owner: RouteOwner) {
    this.owner = Object.freeze({ ...owner });
  }

  /** Observe this owner only; unsubscribing one view cannot deactivate other views or pending operations. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Read the stable nested-frozen snapshot without exposing mutable retry aliases. */
  readonly snapshot = (): RouteSessionSnapshot => this.state;

  /** Read canonical context monotonically; a GET never acknowledges or releases an uncertain command. */
  readonly load = async (signal?: AbortSignal): Promise<TripRouteRead> => {
    assertRouteOwner(this.owner);
    const generation = ++this.readGeneration;
    ++this.reads;
    this.publish({ reading: true, readError: null });
    try {
      const read = await loadTripRoute(this.owner, signal);
      this.acceptRead(read, generation);
      return read;
    } catch (error) {
      if (generation === this.readGeneration)
        this.publish({
          readError:
            error instanceof Error ? error : new Error('Route read failed', { cause: error }),
        });
      throw error;
    } finally {
      --this.reads;
      this.publish({ reading: this.reads > 0 });
    }
  };

  private acceptRead(read: TripRouteRead, generation: number): void {
    if (
      generation === this.readGeneration &&
      read.revision >= (this.state.view?.route.revision ?? -1)
    ) {
      if (
        this.state.view &&
        read.revision !== this.state.view.route.revision &&
        !this.state.pending &&
        this.state.failure?.kind !== 'uncertain'
      )
        this.history = [];
      this.publish({
        view: ownRouteValue({
          route: routeWithoutAvailability(read),
          missingSources: read.missingSources,
        }),
      });
    }
  }

  /** Explicit canonical reconciliation releases only a definitively rejected request after a successful fresh read. */
  readonly reload = async (): Promise<void> => {
    const failure = this.state.failure;
    const reading = this.load();
    const generation = this.readGeneration;
    const read = await reading;
    if (
      generation === this.readGeneration &&
      failure?.kind === 'rejected' &&
      this.state.failure === failure &&
      this.state.view?.route.revision === read.revision
    ) {
      this.history = [];
      this.publish({ failure: undefined });
    }
  };

  /** Synchronously claim a new intention using one UUID and its exact observed aggregate revision. */
  readonly run = async (command: RouteEditCommand): Promise<void> => {
    await this.start(command);
  };

  private async start(command: RouteCommand): Promise<void> {
    assertRouteOwner(this.owner);
    if (this.state.pending || this.state.failure || !this.state.view) return;
    await this.submit(
      ownRouteValue({
        operationId: crypto.randomUUID(),
        expectedRevision: this.state.view.route.revision,
        command,
      })
    );
  }

  /** Replay the original UUID/revision/payload; neither source refresh nor another view can rebase it. */
  readonly retry = async (): Promise<void> => {
    assertRouteOwner(this.owner);
    if (!this.state.pending && this.state.failure) await this.submit(this.state.failure.operation);
  };

  /** Target only the newest confirmed own active receipt; the producer validates the complete untouched outcome. */
  readonly undo = async (): Promise<void> => {
    assertRouteOwner(this.owner);
    const prior = this.history.at(-1);
    if (prior && this.state.canUndo)
      await this.start({ kind: 'undo', targetOperationId: prior.receipt.operationId });
  };

  private publish(patch: Partial<RouteSessionSnapshot>): void {
    const next = { ...this.state, ...patch };
    const prior = this.history.at(-1);
    this.state = Object.freeze({
      ...next,
      canUndo:
        !next.pending &&
        !next.failure &&
        prior !== undefined &&
        next.view?.route.revision === prior.revision,
    });
    for (const listener of this.listeners) listener();
  }

  private async submit(operation: RouteOperation): Promise<void> {
    const generation = ++this.readGeneration;
    this.publish({ pending: operation, failure: undefined });
    try {
      const result = ownRouteValue(await applyRouteOperation(this.owner, operation));
      requireOwnReceipt(this.owner, operation, result);
      this.accept(operation, result, generation);
    } catch (error) {
      const rejected =
        error instanceof RouteContextError ||
        (error instanceof ApiError &&
          error.status !== undefined &&
          [400, 404, 409].includes(error.status));
      if (rejected) this.history = [];
      this.publish({
        failure: Object.freeze({ operation, kind: rejected ? 'rejected' : 'uncertain', error }),
      });
    } finally {
      this.publish({ pending: undefined });
    }
  }

  private accept(
    operation: RouteOperation,
    result: RouteOperationResult,
    generation: number
  ): void {
    const { receipt, current } = result;
    const observed = this.state.view?.route.revision ?? -1;
    this.updateHistory(operation, result, observed);
    const view =
      current.revision > observed ||
      (current.revision === observed && generation === this.readGeneration)
        ? ownRouteValue({ route: current, missingSources: undefined })
        : this.state.view;
    this.publish({
      view,
      receipts: Object.freeze([...this.state.receipts, receipt]),
      failure: undefined,
    });
  }
  private updateHistory(
    operation: RouteOperation,
    result: RouteOperationResult,
    observed: number
  ): void {
    const { receipt, current } = result;
    const active =
      !result.undone && sameRoute(current, receipt.after) && current.revision >= observed;
    if (!active) this.history = [];
    else if (operation.command.kind === 'undo') {
      if (this.history.at(-1)?.receipt.operationId === operation.command.targetOperationId)
        this.history.pop();
      else this.history = [];
      const predecessor = this.history.at(-1);
      if (predecessor) predecessor.revision = current.revision;
    } else if (receipt.after.revision > receipt.before.revision) {
      this.history.push({ receipt, revision: current.revision });
    }
  }
}
