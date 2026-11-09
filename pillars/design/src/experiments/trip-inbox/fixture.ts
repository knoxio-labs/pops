import { initialCapture } from '../trip-quick-capture/fixture';
import { initialCanvas } from '../trip-route-editing/canvas-model';

import type { InboxScenario, InboxState } from './types';

/** Named fictional source capture and organisation review states. */
export type { InboxScenario } from './types';

/** Builds independent approved raw captures and actual typed route sources with explicit organisation associations. */
export function createInboxState(scenario: InboxScenario = 'default'): InboxState {
  const canvas = initialCanvas('default');
  const capture = initialCapture(scenario === 'empty' ? 'empty' : 'default');
  const state: InboxState = {
    capture,
    targets: canvas.records,
    places: canvas.places,
    routeOrder: canvas.order,
    associations: [],
    creationDefaults: { intention: 'Considering', arrangement: 'Not arranged' },
  };
  if (scenario === 'organised')
    state.associations = [
      { id: 'organised-walk', sourceId: 'capture-recife-note', targetId: 'walk' },
      { id: 'organised-event', sourceId: 'capture-recife-link', targetId: 'festival' },
    ];
  if (scenario === 'missing-reference')
    state.associations = [
      { id: 'missing-target', sourceId: 'capture-recife-note', targetId: 'removed-target' },
      { id: 'missing-source', sourceId: 'removed-source', targetId: 'walk' },
    ];
  if (scenario === 'files') state.capture.draft = initialCapture('document').draft;
  if (scenario === 'duplicate-names') {
    state.targets = state.targets.map((target) =>
      target.id === 'walk' || target.id === 'friends'
        ? { ...target, title: 'Walk together' }
        : target
    );
    state.capture.items = state.capture.items.map((source) => ({
      ...source,
      title: 'Travel note',
    }));
  }
  return state;
}
