import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import { createClient } from '../trips-api/client';
import { overviewProps, overviewResponses } from './test-utils';
import { TripOverview } from './TripOverview';

import type { JSX } from 'react';

import type { Client } from '../trips-api/client';
import type { TripOverviewProps } from './types';

/** Mount the actual generated transport with independently failing source responses. */
export function mountOverview(
  responses = overviewResponses(),
  wait?: { path: string; until: Promise<void> },
  props: Partial<TripOverviewProps> = {}
): {
  requests: string[];
  cache: QueryClient;
  client: Client;
  rerender: (props?: Partial<TripOverviewProps>) => void;
} {
  const requests: string[] = [];
  const client = createClient({
    baseUrl: 'http://overview.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      requests.push(path);
      if (path === wait?.path) await wait.until;
      return new Response(
        JSON.stringify(
          responses.get(path) ?? {
            code: 'trips.source.unavailable',
            message: 'Source read failed',
            retryable: true,
          }
        ),
        { status: responses.has(path) ? 200 : 503, headers: { 'content-type': 'application/json' } }
      );
    },
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (nextProps: Partial<TripOverviewProps> = {}): JSX.Element => {
    const effective = { ...overviewProps, ...props, ...nextProps, client };
    if (effective.calendar && !effective.onOpenSource)
      throw new Error('Calendar host must open canonical sources');
    const content =
      effective.calendar && effective.onOpenSource ? (
        <TripOverview
          {...effective}
          calendar={effective.calendar}
          onOpenSource={effective.onOpenSource}
        />
      ) : (
        <TripOverview {...effective} calendar={undefined} />
      );
    return <QueryClientProvider client={cache}>{content}</QueryClientProvider>;
  };
  const mounted = render(view());
  return { requests, cache, client, rerender: (nextProps) => mounted.rerender(view(nextProps)) };
}
