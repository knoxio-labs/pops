/**
 * NudgeIndicator — notification bell showing pending nudge count.
 *
 * Served to the shell's top bar from this pillar's bundle under the
 * `topBarWidgets` slot the manifest declares, so the shell renders it only
 * while cerebrum is registered and never learns the endpoint or route below.
 *
 * Polls `POST /nudges/search` through the shell's `/cerebrum-api` proxy and
 * displays a badge on the bell icon when there are pending nudges. Clicking
 * navigates to the nudges page. The proxy (vite in dev, nginx in prod) strips
 * the `/cerebrum-api` prefix so the pillar sees `/nudges/search`.
 */
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router';

import { CEREBRUM_NAV } from '@pops/cerebrum/manifest';
import { Button } from '@pops/ui';

const POLL_BASE_MS = 60_000;
const MAX_FAILURES = 5;

const NUDGES_SEARCH_URL = '/cerebrum-api/nudges/search';
const NUDGES_PAGE_PATH = `${CEREBRUM_NAV.basePath}/nudges`;

/** Failure carrying the HTTP status so the bell can hide on 404 / unavailable. */
class NudgeFetchError extends Error {
  constructor(readonly status: number | undefined) {
    super(`nudges fetch failed: ${status ?? 'network'}`);
    this.name = 'NudgeFetchError';
  }
}

/**
 * Exponential backoff for the nudges poller. Keys off fetchFailureCount (which
 * resets to 0 on success) so the interval recovers automatically once the
 * endpoint starts returning 200s again, and stops polling past MAX_FAILURES.
 */
export function nudgeRefetchInterval(query: {
  state: { fetchFailureCount: number };
}): number | false {
  const failures = query.state.fetchFailureCount;
  if (failures >= MAX_FAILURES) return false;
  return POLL_BASE_MS * 2 ** failures;
}

function parsePendingTotal(value: unknown): number {
  if (typeof value === 'object' && value !== null) {
    const total = (value as { total?: unknown }).total;
    if (typeof total === 'number') return total;
  }
  throw new NudgeFetchError(undefined);
}

async function fetchPendingCount(signal: AbortSignal): Promise<number> {
  const response = await fetch(NUDGES_SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'pending', limit: 1 }),
    signal,
  });
  if (!response.ok) throw new NudgeFetchError(response.status);
  return parsePendingTotal(await response.json());
}

/**
 * The bell the shell mounts in its top bar. Takes no props; renders nothing
 * once the nudges endpoint answers with an error or not at all.
 */
export function NudgeIndicator() {
  const navigate = useNavigate();
  const { data, isError } = useQuery({
    queryKey: ['cerebrum', 'nudges', 'list', { status: 'pending', limit: 1 }],
    queryFn: ({ signal }) => fetchPendingCount(signal),
    retry: false,
    staleTime: 30_000,
    refetchInterval: nudgeRefetchInterval,
  });

  // Hide the bell when cerebrum is unreachable / not-found rather than render a
  // broken indicator.
  if (isError) return null;

  const pendingCount = data ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative min-w-[44px] min-h-[44px]"
      aria-label={`Nudges: ${pendingCount} pending`}
      onClick={() => navigate(NUDGES_PAGE_PATH)}
    >
      <Bell className="h-5 w-5" />
      {pendingCount > 0 && (
        <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}
    </Button>
  );
}
