import { ApiError } from '@pops/pillar-sdk/client';

import { createVisitPlace } from './api';

import type { RetainedSourceOwner, SourceSessionView } from '../shared/retained-session-store';
import type { Place, VisitFieldProps } from './types';

/** Semantic capture state and creation proof retained independently of a mounted Visit view. */
export interface PlaceCaptureState {
  name: string;
  created: Place | undefined;
  busy: boolean;
  failure: unknown;
  uncertain: boolean;
}

/** One serialized Place creation/association flow; POST has no idempotency guarantee. */
export class PlaceCaptureSession {
  private state: PlaceCaptureState = {
    name: '',
    created: undefined,
    busy: false,
    failure: undefined,
    uncertain: false,
  };
  private readonly listeners = new Set<() => void>();
  private readonly placesKey: readonly string[];
  constructor(private readonly owner: RetainedSourceOwner) {
    this.placesKey = ['trips', owner.client.getConfig().baseUrl ?? '/trips-api', 'places'];
  }

  /** Read a stable observable snapshot until a semantic state transition occurs. */
  getState = (): PlaceCaptureState => this.state;

  /** Subscribe independently of any view's action permission. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Preserve the user's literal name before creation. */
  setName(name: string): void {
    this.update({ name });
  }

  /** Start another capture only after the owning Visit confirms this receipt's association. */
  beginNew(associatedPlaceId: number): void {
    if (this.state.busy || this.state.uncertain || this.state.created?.id !== associatedPlaceId)
      return;
    this.update({ created: undefined, name: '', failure: undefined });
  }

  /** Use this invocation's callback and lease; an acknowledged creation never runs POST again. */
  async submit(commit: VisitFieldProps['commit'], view: SourceSessionView): Promise<void> {
    if (!view.isCurrent() || this.state.busy || this.state.uncertain) return;
    if (!this.state.created && !this.state.name.trim()) return;
    const name = this.state.name;
    this.update({ busy: true, failure: undefined });
    let creationDispatched = false;
    try {
      view.assertCurrent();
      let place = this.state.created;
      if (!place) {
        creationDispatched = true;
        place = await createVisitPlace(
          { client: this.owner.client, tripId: this.owner.tripId, visitId: this.owner.sourceId },
          name
        );
        this.update({ created: place });
        this.rememberPlace(place);
      }
      view.assertCurrent();
      await commit({ placeId: place.id });
    } catch (error) {
      this.update({
        failure: error,
        uncertain: creationDispatched && !this.state.created && !explicitRejection(error),
      });
    } finally {
      this.update({ busy: false });
    }
  }

  /** Reloading the catalogue supplies no creation receipt and cannot clear an uncertain outcome. */
  reload(action: () => Promise<unknown>, view: SourceSessionView): void {
    if (!view.isCurrent()) return;
    void action().catch((error: unknown) => this.update({ failure: error }));
  }
  private update(patch: Partial<PlaceCaptureState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private rememberPlace(place: Place): void {
    this.owner.scope.setQueryData<Place[]>(this.placesKey, (previous) =>
      previous?.some((item) => item.id === place.id) ? previous : [...(previous ?? []), place]
    );
  }
}
function explicitRejection(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408
  );
}
