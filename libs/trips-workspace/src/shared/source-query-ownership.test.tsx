import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';

import { DecisionWorkspace } from '../decision/DecisionWorkspace';
import { sourceDecision } from '../decision/test-utils';
import { EventWorkspace } from '../event/EventWorkspace';
import { sourceEvent } from '../event/test-utils';
import { JourneyWorkspace } from '../journey/JourneyWorkspace';
import { sourceJourney, sourceLeg } from '../journey/test-utils';
import { StayWorkspace } from '../stay/StayWorkspace';
import { problem, sourceStay, testNightLabel } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { sourceVisit } from '../visit/test-utils';
import english from '../visit/translation.test-fixture.json';
import { VisitWorkspace } from '../visit/VisitWorkspace';

import type { ReactElement } from 'react';

import type { Client } from '../trips-api/client';

interface SourceCase {
  kind: string;
  id: number;
  path: string;
  field: string;
  workspace: (client: Client | undefined) => ReactElement;
  response: (path: string, label: string) => unknown;
  snapshot: (label: string) => unknown;
}
const decision = (label: string) => {
  const source = sourceDecision();
  return { ...source, decision: { ...source.decision, question: label } };
};
const journey = (label: string) => ({
  journey: sourceJourney({ name: label }),
  legs: [sourceLeg({ mode: label })],
  legRevision: 0,
});
const visitCase: SourceCase = {
  kind: 'visit',
  id: 31,
  path: '/trips/7/visits/31',
  field: 'Visit notes',
  workspace: (client) => <VisitWorkspace tripId={7} visitId={31} client={client} />,
  response: (path, label) =>
    path === '/trips/7/visits/31' ? sourceVisit({ notes: label }) : undefined,
  snapshot: (label) => sourceVisit({ notes: label }),
};
const cases: SourceCase[] = [
  {
    kind: 'stay',
    id: 13,
    path: '/trips/7/stays/13',
    field: 'Stay name',
    workspace: (client) => (
      <StayWorkspace tripId={7} stayId={13} client={client} formatNights={testNightLabel} />
    ),
    response: (path, label) =>
      path === '/trips/7/stays/13' ? sourceStay({ name: label }) : undefined,
    snapshot: (label) => sourceStay({ name: label }),
  },
  {
    kind: 'event',
    id: 19,
    path: '/trips/7/events/19',
    field: 'Event name',
    workspace: (client) => <EventWorkspace tripId={7} eventId={19} client={client} />,
    response: (path, label) =>
      path === '/trips/7/events/19' ? sourceEvent({ name: label }) : undefined,
    snapshot: (label) => sourceEvent({ name: label }),
  },
  visitCase,
  {
    kind: 'journey',
    id: 20,
    path: '/trips/7/journeys/20',
    field: 'Transport mode',
    workspace: (client) => <JourneyWorkspace tripId={7} journeyId={20} client={client} />,
    response: (path, label) => {
      if (path === '/trips/7/journeys/20') return journey(label).journey;
      if (path === '/trips/7/journeys/20/legs') return { revision: 0, legs: journey(label).legs };
      return undefined;
    },
    snapshot: journey,
  },
  {
    kind: 'decision',
    id: 8,
    path: '/trips/7/decisions/8/workspace',
    field: 'Question',
    workspace: (client) => <DecisionWorkspace tripId={7} decisionId={8} client={client} />,
    response: (path, label) =>
      path === '/trips/7/decisions/8/workspace' ? decision(label) : undefined,
    snapshot: decision,
  },
];
const originA = 'http://source-owner-a.test';
const originB = 'http://source-owner-b.test';
const labelA = 'Original source at A';
const labelB = 'Independent source at B';
const caches: QueryClient[] = [];
const originalDefaultConfig = defaultClient.getConfig();
const locale = createInstance();
await locale.init({
  lng: 'en-AU',
  resources: { 'en-AU': { trips: { visitWorkspace: english } } },
  interpolation: { escapeValue: false },
});
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  defaultClient.setConfig(originalDefaultConfig);
});
function sourceTransport(source: SourceCase, gate?: Promise<void>) {
  const requests: string[] = [];
  let unavailable = false;
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.url);
    const url = new URL(request.url);
    const body = source.response(url.pathname, url.origin === originA ? labelA : labelB);
    if (body === undefined || (unavailable && url.origin === originA))
      return Response.json(problem('trips.source.unavailable'), { status: 503 });
    if (url.origin === originA) await gate;
    return Response.json(body);
  };
  return {
    requests,
    fetcher,
    client: createClient({ baseUrl: originA, fetch: fetcher }),
    failA: (): void => {
      unavailable = true;
    },
  };
}
function host(source: SourceCase, client: Client | undefined) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  return {
    cache,
    keyA: ['trips', originA, 7, source.kind, source.id],
    keyB: ['trips', originB, 7, source.kind, source.id],
    mount: () =>
      render(
        <I18nextProvider i18n={locale}>
          <QueryClientProvider client={cache}>{source.workspace(client)}</QueryClientProvider>
        </I18nextProvider>
      ),
  };
}
function hasOrigin(requests: string[], origin: string): boolean {
  return requests.some((url) => new URL(url).origin === origin);
}
it.each(cases)(
  '$kind never dispatches another origin into its original source key and retains A through failed reopen',
  async (source) => {
    const transport = sourceTransport(source);
    const context = host(source, transport.client);
    const first = context.mount();
    expect(await screen.findByLabelText(source.field)).toHaveValue(labelA);
    expect(context.cache.getQueryData(context.keyA)).toEqual(source.snapshot(labelA));
    transport.client.setConfig({ baseUrl: originB });
    await act(() => context.cache.refetchQueries({ queryKey: context.keyA, exact: true }));
    await act(() => context.cache.refetchQueries({ type: 'active' }));
    expect(transport.requests.filter((request) => new URL(request).origin === originB)).toEqual([]);
    expect(context.cache.getQueryData(context.keyA)).toEqual(source.snapshot(labelA));
    expect(context.cache.getQueryData(context.keyB)).toBeUndefined();
    transport.client.setConfig({ baseUrl: originA });
    transport.failA();
    first.unmount();
    context.mount();
    await waitFor(() => expect(screen.getByLabelText(source.field)).toHaveValue(labelA));
    await waitFor(() => expect(context.cache.getQueryState(context.keyA)?.status).toBe('error'));
    expect(context.cache.getQueryData(context.keyA)).toEqual(source.snapshot(labelA));
    expect(hasOrigin(transport.requests, originB)).toBe(false);
  }
);
it('captures the actual default client origin when the host omits its client prop', async () => {
  const source = visitCase;
  const transport = sourceTransport(source);
  defaultClient.setConfig({ baseUrl: originA, fetch: transport.fetcher });
  const context = host(source, undefined);
  const first = context.mount();
  expect(await screen.findByLabelText(source.field)).toHaveValue(labelA);
  expect(context.cache.getQueryData(context.keyA)).toEqual(source.snapshot(labelA));
  defaultClient.setConfig({ baseUrl: originB });
  await act(() => context.cache.refetchQueries({ type: 'active' }));
  expect(hasOrigin(transport.requests, originB)).toBe(false);
  expect(context.cache.getQueryData(context.keyA)).toEqual(source.snapshot(labelA));
  expect(context.cache.getQueryData(context.keyB)).toBeUndefined();
  defaultClient.setConfig({ baseUrl: originA });
  transport.failA();
  first.unmount();
  context.mount();
  await waitFor(() => expect(screen.getByLabelText(source.field)).toHaveValue(labelA));
  await waitFor(() => expect(context.cache.getQueryState(context.keyA)?.status).toBe('error'));
});
it.each([
  ...cases.map((source) => ({ source, omitClient: false })),
  { source: visitCase, omitClient: true },
])(
  '$source.kind keeps a deferred A result out of a B controller until an explicit B remount (omitted client: $omitClient)',
  async ({ source, omitClient }) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport = sourceTransport(source, gate);
    if (omitClient) defaultClient.setConfig({ baseUrl: originA, fetch: transport.fetcher });
    const client = omitClient ? defaultClient : transport.client;
    const context = host(source, omitClient ? undefined : client);
    const first = context.mount();
    await waitFor(() => expect(transport.requests).toContain(`${originA}${source.path}`));
    client.setConfig({ baseUrl: originB });
    await act(async () => release());
    await waitFor(() => expect(context.cache.getQueryState(context.keyA)?.status).toBe('success'));
    expect(context.cache.getQueryData(context.keyA)).toEqual(source.snapshot(labelA));
    expect(context.cache.getQueryData(context.keyB)).toBeUndefined();
    expect(hasOrigin(transport.requests, originB)).toBe(false);
    expect(screen.queryByLabelText(source.field)).toBeNull();
    first.unmount();
    context.mount();
    expect(await screen.findByLabelText(source.field)).toHaveValue(labelB);
    expect(context.cache.getQueryData(context.keyB)).toEqual(source.snapshot(labelB));
    expect(context.cache.getQueryData(context.keyA)).toEqual(source.snapshot(labelA));
  }
);
