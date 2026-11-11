import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { sourceStay, sourceVisits } from '../stay/test-utils';
import { arrangementVisitCoverage } from './coverage';
import { arrangementsTransport, labels } from './test-utils';
import { useArrangements } from './use-arrangements';
import { useGapCapture } from './use-gap-capture';

import type { ReactNode } from 'react';

it('explicit Reload updates the original legacy collection and coverage without acknowledging unknown POST', async () => {
  const transport = arrangementsTransport();
  transport.collections.set('/trips/7/stays', { stays: [] });
  const client = transport.client;
  const origin = client.getConfig().baseUrl;
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const identity = { tripId: 7, client, labels, formatDate: String };
  const open = vi.fn();
  const visit = sourceVisits[0];
  if (!visit) throw new Error('Missing Visit');
  const arrival = visit.timing.arrival;
  const departure = visit.timing.departure;
  if (!arrival || !departure) throw new Error('Expected explicit bounded Visit');
  try {
    const view = renderHook(
      () => ({ model: useArrangements(identity), capture: useGapCapture(identity, open) }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        ),
      }
    );
    await waitFor(() => expect(view.result.current.model.coverageComplete).toBe(true));
    expect(view.result.current.model.sources.stays).toEqual([]);
    expect(
      arrangementVisitCoverage(visit, view.result.current.model.sources, true).findings.some(
        (finding) => finding.kind === 'missing'
      )
    ).toBe(true);
    transport.replies.push({
      status: 503,
      body: { code: 'lost', message: 'Lost', retryable: true },
    });
    await act(() =>
      view.result.current.capture.create(visit.id, {
        kind: 'missing',
        arrival,
        departure,
        stayIds: [],
      })
    );
    expect(view.result.current.capture.uncertain).toBe(true);
    const later = sourceStay({ id: 88, timing: { arrival, departure }, status: 'Reserved' });
    transport.collections.set('/trips/7/stays', { stays: [later] });
    await act(() => view.result.current.capture.reload());
    expect(
      cache.getQueriesData({ queryKey: ['trips', origin, 7, 'stays', 'accommodation'] })[0]?.[1]
    ).toEqual([later]);
    expect(cache.getQueryData(['trips', origin, 7, 'stays'])).toEqual([later]);
    expect(view.result.current.model.sources.stays).toEqual([later]);
    expect(
      arrangementVisitCoverage(
        visit,
        view.result.current.model.sources,
        view.result.current.model.coverageComplete
      ).findings
    ).toEqual([]);
    expect(view.result.current.capture.uncertain).toBe(true);
    expect(transport.writes).toHaveLength(1);
    expect(open).not.toHaveBeenCalled();
  } finally {
    cleanup();
    cache.clear();
  }
});
