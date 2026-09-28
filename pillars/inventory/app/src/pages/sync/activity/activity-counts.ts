import { SERVER_KIND_GROUPS } from './activity-model.js';

import type { KindGroup } from './activity-model.js';

/** Counts wire event kinds under every Activity filter, independent of the active kind filter. */
export function serverKindGroupCounts(
  kindCounts: Readonly<Record<string, number>>
): Record<KindGroup, number> {
  const counts: Record<KindGroup, number> = {
    all: 0,
    placement: 0,
    containers: 0,
    edits: 0,
    lifecycle: 0,
    created: 0,
  };
  for (const [kind, count] of Object.entries(kindCounts)) {
    counts.all += count;
    for (const [group, kinds] of Object.entries(SERVER_KIND_GROUPS)) {
      if (kinds.includes(kind)) counts[group as Exclude<KindGroup, 'all'>] += count;
    }
  }
  return counts;
}
