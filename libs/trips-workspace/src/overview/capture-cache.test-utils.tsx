import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { z } from 'zod';

import { captureSource, sourceCapture, sourceIdea } from '../capture/test-utils';
import { CaptureWorkspace, TripOverview } from '../index';
import { createClient } from '../trips-api/client';
import { overviewProps, overviewResponses } from './test-utils';

import type { JSX } from 'react';

import type { CaptureResult, CaptureSource } from '../capture/types';
import type { Client } from '../trips-api/client';

type Visible = 'overview' | 'capture' | 'both';
type Write = (operationId: string) => Promise<Response>;

/** One host scope and its independently controllable canonical source transport. */
export interface CaptureTimelineFixture {
  cache: QueryClient;
  client: Client;
  source: CaptureSource;
  reads: string[];
  writes: unknown[];
  show: (visible: Visible) => void;
  setSource: (source: CaptureSource) => void;
  setWrite: (write: Write) => void;
}

/** Public tools sharing one host cache, with real generated requests and independently shaped reads. */
export function mountCaptureTimeline(initial: Visible = 'both'): CaptureTimelineFixture {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let source = captureSource([
    sourceCapture({ tripId: 7, visitId: 31, originalText: 'Timeline capture' }),
  ]);
  source.ideas = [sourceIdea({ tripId: 7, visitId: 31, name: 'Timeline idea' })];
  const responses = overviewResponses();
  responses.set('/trips/7/meeting-plans', { meetingPlans: [] });
  responses.set('/trips/7/rentals', { rentals: [] });
  const reads: string[] = [];
  const writes: unknown[] = [];
  let write = async (operationId: string): Promise<Response> =>
    Response.json(captureReceipt(operationId, source));
  const client = createClient({
    baseUrl: 'http://capture-timeline.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (request.method !== 'GET') {
        const body: unknown = await request.json();
        writes.push(body);
        return write(z.object({ operationId: z.uuid() }).parse(body).operationId);
      }
      reads.push(path);
      if (path === '/trips/7/capture-workspace') return Response.json(source);
      return Response.json(
        responses.get(path) ?? {
          code: 'trips.source.unavailable',
          message: 'Source unavailable',
          retryable: true,
        },
        { status: responses.has(path) ? 200 : 503 }
      );
    },
  });
  const view = (visible: Visible): JSX.Element => (
    <QueryClientProvider client={cache}>
      {visible !== 'capture' && (
        <TripOverview {...overviewProps} client={client} onOpenSource={() => undefined} />
      )}
      {visible !== 'overview' && <CaptureWorkspace tripId={7} client={client} view="capture" />}
    </QueryClientProvider>
  );
  const mounted = render(view(initial));
  return {
    cache,
    client,
    source,
    reads,
    writes,
    show: (visible: Visible): void => mounted.rerender(view(visible)),
    setSource: (next: CaptureSource): void => {
      source = next;
    },
    setWrite: (next: Write): void => {
      write = next;
    },
  };
}

/** Acknowledged producer snapshot tied to the exact submitted operation UUID. */
export function captureReceipt(operationId: string, source: CaptureSource): CaptureResult {
  return {
    receipt: { ...source, operationId, undoneOperationId: null },
    current: source,
    replayed: false,
    undone: false,
  };
}
