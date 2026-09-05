import { feedVerb, importStatusFor, type Staleness } from '@/fixtures/import-status';
import { Clock, TriangleAlert } from 'lucide-react';

import { Badge } from '@pops/ui';

/**
 * The staleness nudge (POPS-2890) as a badge. It speaks only when there is
 * something to do: a fresh account says nothing, since a badge on every tile
 * would be the wallpaper the stale one has to be seen against. "Never" is
 * silent too — an account nobody has imported into is not overdue, it is
 * unstarted, and the imports page says so in its own words.
 */
export function ImportStalenessBadge({ accountId }: { accountId: string }) {
  const status = importStatusFor(accountId);
  const label = stalenessLabel(status.staleness, status.daysQuiet, feedVerb(status.kind));
  if (label === undefined) return null;
  const stale = status.staleness === 'stale';
  return (
    <Badge variant={stale ? 'destructive' : 'secondary'} className="gap-1 font-normal">
      {stale ? <TriangleAlert className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

export function stalenessLabel(
  staleness: Staleness,
  daysQuiet: number | undefined,
  verb: 'sync' | 'import'
): string | undefined {
  if (staleness === 'fresh' || staleness === 'never' || daysQuiet === undefined) return undefined;
  const quiet = daysQuiet === 1 ? '1 day' : `${daysQuiet} days`;
  return staleness === 'stale'
    ? `No ${verb} for ${quiet}`
    : `${verb === 'sync' ? 'Sync' : 'Import'} due`;
}
