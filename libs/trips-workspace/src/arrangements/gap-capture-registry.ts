import { GapCaptureSession } from './gap-capture-session';
import { currentSourceOwner, sameSourceOwner, sourceOwner } from './source-owner';

import type { AccommodationGapIdentity } from './accommodation-gap-types';
import type { SourceOwner } from './source-owner';

type Identity = AccommodationGapIdentity;
/** Retained gap receipts use the original owner transport and a live fence before any new action. */
export interface GapCaptureBinding {
  readonly session: GapCaptureSession;
  readonly identity: Readonly<Pick<SourceOwner, 'client' | 'tripId'>>;
  readonly owner: SourceOwner;
  readonly staysKey: readonly (string | number)[];
  readonly isCurrent: () => boolean;
}
/** Keep each exact source owner's capture controllers dormant across origin, client and trip changes. */
export class GapCaptureRegistry {
  private current: SourceOwner | undefined;
  private readonly views = new Map<object, SourceOwner>();
  private readonly entries: { owner: SourceOwner; binding: GapCaptureBinding }[] = [];

  /** Initialize the registry with the host's first owning source context. */
  constructor(identity?: Identity) {
    if (identity) this.activate(identity);
  }
  /** Activate the committed host without moving or discarding another context's receipts. */
  activate(identity: Identity): void {
    this.current = sourceOwner(identity);
  }
  /** Reject stale actions after the owning host unmounts or its effect is cleaned up. */
  deactivate(): void {
    this.current = undefined;
  }
  /** A mounted provider owns only its lease; another view closing cannot disable this one. */
  acquire(identity: Identity): () => void {
    const token = {};
    this.views.set(token, sourceOwner(identity));
    return () => {
      this.views.delete(token);
    };
  }
  /** Resolve the same controller only for the exact original transport, origin and trip. */
  get(identity: Identity): GapCaptureBinding {
    const captured = sourceOwner(identity);
    const retained = this.entries.find((entry) => sameSourceOwner(entry.owner, captured));
    if (retained) return retained.binding;
    const binding = Object.freeze({
      session: new GapCaptureSession(),
      owner: captured,
      identity: Object.freeze({ client: captured.client, tripId: captured.tripId }),
      staysKey: Object.freeze([
        'trips',
        captured.origin,
        captured.tripId,
        'stays',
        'accommodation',
        crypto.randomUUID(),
      ]),
      isCurrent: () =>
        currentSourceOwner(captured, this.current) ||
        [...this.views.values()].some((view) => currentSourceOwner(captured, view)),
    });
    this.entries.push({ owner: captured, binding });
    return binding;
  }
}
