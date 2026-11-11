import { ResponsibilitySession } from './responsibility-session';
import { currentSourceOwner, sameSourceOwner, sourceOwner } from './source-owner';

import type { Client } from '../trips-api/client';
import type { SourceOwner } from './source-owner';
import type {
  ArrangementResponsibility,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
} from './types';

type Identity = Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>;

/** One exact source controller and its original owner transport; inactive contexts cannot start or retry writes. */
export interface ResponsibilityBinding {
  readonly session: ResponsibilitySession;
  readonly identity: Readonly<{ client: Client; tripId: number }>;
  readonly target: Readonly<ArrangementTarget>;
  readonly queryKey: readonly (string | number)[];
  readonly isCurrent: () => boolean;
  readonly matchesSource: (source: ArrangementResponsibility) => boolean;
}

/** Retain exact client/origin/trip/target operations while host context changes leave their receipts dormant. */
export class ResponsibilityRegistry {
  private current: SourceOwner | undefined;
  private readonly entries: { owner: SourceOwner; binding: ResponsibilityBinding }[] = [];

  /** Initialize the registry with the host's first owning source context. */
  constructor(identity: Identity) {
    this.activate(identity);
  }

  /** Set the committed owning context without replacing another context's operations. */
  activate(identity: Identity): void {
    this.current = sourceOwner(identity);
  }

  /** Block callbacks after the owning host unmounts, including effect cleanup before replay. */
  deactivate(): void {
    this.current = undefined;
  }

  /** Resolve only the controller whose exact source and owner identity were originally captured. */
  get(identity: Identity, target: ArrangementTarget): ResponsibilityBinding {
    const captured = sourceOwner(identity);
    const retained = this.entries.find(
      (entry) =>
        sameSourceOwner(entry.owner, captured) &&
        entry.binding.target.targetKind === target.targetKind &&
        entry.binding.target.targetId === target.targetId
    );
    if (retained) return retained.binding;
    const source = Object.freeze({ ...target });
    const binding: ResponsibilityBinding = Object.freeze({
      session: new ResponsibilitySession(),
      identity: Object.freeze({ client: captured.client, tripId: captured.tripId }),
      target: source,
      queryKey: Object.freeze([
        'trips',
        captured.origin,
        captured.tripId,
        'responsibility',
        source.targetKind,
        source.targetId,
        crypto.randomUUID(),
      ]),
      isCurrent: () => currentSourceOwner(captured, this.current),
      matchesSource: (value: ArrangementResponsibility) =>
        value.tripId === captured.tripId &&
        value.targetKind === source.targetKind &&
        value.targetId === source.targetId,
    });
    this.entries.push({ owner: captured, binding });
    return binding;
  }
}
