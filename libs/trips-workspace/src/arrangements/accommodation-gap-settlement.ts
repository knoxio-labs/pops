import type { QueryClient } from '@tanstack/react-query';

import type { SourceSessionView } from '../shared/retained-session-store';
import type { Stay } from '../stay/types';
import type { GapCaptureBinding } from './gap-capture-registry';

/** Known creation belongs to its captured cache even after its view closes; only current views may start refresh reads. */
export function settleAccommodationStay(
  cache: QueryClient,
  binding: GapCaptureBinding,
  view: SourceSessionView,
  isVisible?: () => boolean
): (source: Stay) => void {
  return (source) => {
    cache.setQueryData<Stay[]>(binding.staysKey, (previous) =>
      previous?.some((stay) => stay.id === source.id) ? previous : [...(previous ?? []), source]
    );
    const current = binding.isCurrent() && view.isCurrent() && (isVisible?.() ?? true);
    void cache.invalidateQueries({
      queryKey: binding.staysPrefix,
      refetchType: current ? 'active' : 'none',
    });
  };
}
