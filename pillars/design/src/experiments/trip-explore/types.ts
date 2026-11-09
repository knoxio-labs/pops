import type { TripRecord } from '../../fixtures/trip-overview-model';
import type { TripPlace } from '../../fixtures/trip-places';
import type { EventMetadata, EventReference } from '../trip-event-detail/model';
import type { IdeaState } from '../trip-place-detail/model';
import type { CapturedItem } from '../trip-quick-capture/model';

/** Existing typed sources and verbatim captures stay distinct, including their independent status contracts. */
export type ExploreRecord =
  | { id: string; source: 'idea'; idea: IdeaState }
  | {
      id: string;
      source: 'event';
      event: TripRecord;
      metadata: EventMetadata;
      references: EventReference[];
      places: TripPlace[];
    }
  | {
      id: string;
      source: 'capture';
      capture: CapturedItem;
      kind?: IdeaState['kind'] | 'event';
      cityId: string;
      status: string;
      purpose: string;
      notes: string;
      cities: TripPlace[];
      timing: IdeaState['timing'];
    };
/** Independent collection and explicit source location choices; collection edits never add a route record. */
export interface ExploreState {
  records: ExploreRecord[];
  cities: TripPlace[];
}
/** Source text with optional explicit organisation; absence of classification does not prevent capture. */
export interface ExploreDraft {
  name: string;
  kind: string;
  cityId: string;
  status: string;
  purpose: string;
  notes: string;
  timing: IdeaState['timing'];
}
/** Independent source-backed filters; blank selections impose no constraint. */
export interface ExploreFilters {
  query: string;
  kind: string;
  cityId: string;
  status: string;
  purpose: string;
}
/** Named fictional source collection scenarios. */
export type ExploreScenario = 'default' | 'empty' | 'undated' | 'missing-reference';
