import { sourceOwnerProblem } from '@pops/trips-workspace';

import type { QueryClient } from '@tanstack/react-query';

import type { Client } from '../trips-api/client';

/** Creation follows metadata's host-cache, exact-client and captured-origin retention boundary. */
export interface TripCreationOwner {
  readonly scope: QueryClient;
  readonly client: Client;
  readonly origin: string;
}

/** Mutable transport configuration cannot retarget an unresolved creation command. */
export function assertTripCreationOwner(owner: TripCreationOwner): void {
  if ((owner.client.getConfig().baseUrl ?? '') !== owner.origin) throw sourceOwnerProblem();
}

/** A view lease fences callbacks without cancelling a dispatched command or forgetting its receipt. */
export class TripCreationView {
  private active = false;

  constructor(readonly owner: TripCreationOwner) {}

  /** Reopening the same view permits delivery only under the original connection. */
  activate(): void {
    this.active = true;
  }

  /** Closure and unmount release delivery, not the retained operation. */
  deactivate(): void {
    this.active = false;
  }

  /** Current ownership is checked at the actual user action or delivery point. */
  isCurrent(): boolean {
    return this.active && (this.owner.client.getConfig().baseUrl ?? '') === this.owner.origin;
  }
}
