import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { z } from 'zod';

import { TimelineRouteEditor } from './TimelineRouteEditor';
import { TimelineSourcePlacement } from './TimelineSourcePlacement';
import { createClient } from './trips-api/client';

import type { OverviewPlacementTarget, RouteSource, TripRoute } from '@pops/trips-workspace';

const envelope = z.object({
  operationId: z.uuid(),
  expectedRevision: z.number(),
  command: z.object({ kind: z.string(), targetOperationId: z.uuid().optional() }),
});

function routeTransport(initial: TripRoute) {
  let current = initial;
  let loseNext = false;
  const posts: unknown[] = [];
  const replies: TripRoute[] = [];
  const receipts = new Map<string, object>();
  const client = createClient({
    baseUrl: 'https://route.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (
        new URL(request.url).pathname !==
        (request.method === 'GET' ? '/trips/7/route' : '/trips/7/route/operations')
      )
        throw new Error('Unexpected route URL');
      if (request.method === 'GET') return Response.json({ ...current, missingSources: [] });
      const body: unknown = await request.json();
      posts.push(body);
      const operation = envelope.parse(body);
      const previous = receipts.get(operation.operationId);
      if (previous) return Response.json({ ...previous, current, replayed: true });
      const after = replies.shift();
      if (!after) throw new Error('Missing explicit producer response');
      const result = {
        receipt: {
          operationId: operation.operationId,
          undoneOperationId: operation.command.targetOperationId ?? null,
          before: current,
          after,
        },
        current: after,
        undone: false,
        replayed: false,
      };
      receipts.set(operation.operationId, result);
      current = after;
      if (loseNext) {
        loseNext = false;
        throw new TypeError('Response lost');
      }
      return Response.json(result);
    },
  });
  return {
    client,
    posts,
    replies,
    loseNextWrite: () => {
      loseNext = true;
    },
  };
}

/** Explicit producer snapshots at the generated Request boundary, with immutable receipt replay. */
export async function timelineRouteOwner(initial: TripRoute) {
  const transport = routeTransport(initial);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const translation = createInstance();
  await translation.init({
    lng: 'en',
    resources: {
      en: {
        trips: {
          overview: {
            source: '{{kind}} #{{id}}',
            kinds: { visit: 'Visit', journey: 'Journey', gap: 'Gap' },
            route: 'Route',
          },
          timeline: {
            route: {
              upSource: 'Up {{source}}',
              downSource: 'Down {{source}}',
              gapBefore: 'Gap before {{source}}',
              pathIdentity: 'Path #{{id}}',
            },
          },
        },
      },
    },
  });
  const identity = { tripId: 7, client: transport.client };
  return {
    ...transport,
    cache,
    mount: (
      target: OverviewPlacementTarget | null = null,
      source?: RouteSource,
      showEditor = true
    ) =>
      render(
        <I18nextProvider i18n={translation}>
          <QueryClientProvider client={cache}>
            {showEditor && <TimelineRouteEditor identity={identity} target={target} />}
            {source && <TimelineSourcePlacement identity={identity} source={source} />}
          </QueryClientProvider>
        </I18nextProvider>
      ),
  };
}
