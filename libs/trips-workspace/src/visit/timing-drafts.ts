import { RetainedSessionStore } from '../shared/retained-session-store';
import { SemanticDraft } from '../shared/semantic-draft';
import { useRetainedSession } from '../shared/use-retained-session';
import { useSessionView } from '../shared/use-session-view';

import type { DurationDraft, MonthDraft } from './approximate';
import type { Visit, VisitWorkspaceProps } from './types';

/** Raw approximate timing buffers and their mounted view's edit permission. */
export interface VisitTimingDrafts {
  month: SemanticDraft<MonthDraft>;
  duration: SemanticDraft<DurationDraft>;
  isCurrent: () => boolean;
}

const sessions = new RetainedSessionStore<Pick<VisitTimingDrafts, 'month' | 'duration'>>();

/** Retain invalid timing text under the same literal owner boundaries as its valid Visit source. */
export function useVisitTimingDrafts(
  initial: Visit,
  identity: VisitWorkspaceProps
): VisitTimingDrafts {
  const retained = useRetainedSession(
    sessions,
    {
      client: identity.client,
      tripId: identity.tripId,
      kind: 'visit-timing',
      sourceId: identity.visitId,
    },
    () => ({
      month: new SemanticDraft(monthDraft(initial.timing.month)),
      duration: new SemanticDraft(durationDraft(initial.timing.duration)),
    })
  );
  const view = useSessionView(retained.owner);
  return { ...retained.session, isCurrent: view.isCurrent };
}

/** Preserve exact month text without deriving an omitted year or month. */
export function monthDraft(month: Visit['timing']['month']): MonthDraft {
  return {
    year: month ? String(month.year) : '',
    month: month ? String(month.month) : '',
    part: month?.part ?? '',
  };
}

/** Preserve exact duration text, including one-sided bounds and an omitted unit. */
export function durationDraft(duration: Visit['timing']['duration']): DurationDraft {
  return {
    min: duration?.min === undefined ? '' : String(duration.min),
    max: duration?.max === undefined ? '' : String(duration.max),
    unit: duration?.unit ?? '',
  };
}
