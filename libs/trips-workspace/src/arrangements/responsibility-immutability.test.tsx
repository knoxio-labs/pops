import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ResponsibilitySessions } from './ResponsibilitySessions';
import { arrangementsTransport, labels } from './test-utils';
import { useResponsibility } from './use-responsibility';

import type { ReactNode } from 'react';

afterEach(cleanup);
describe('Responsibility retry payload ownership', () => {
  it('blocks stale retry transports while retaining the exact original uncertain operation', async () => {
    const first = arrangementsTransport();
    const second = arrangementsTransport();
    const contact = { kind: 'contact', uri: 'pops:contacts/contact/issued-a' } as const;
    first.replies.push(
      {
        status: 503,
        body: { code: 'trips.response_lost', message: 'Response unavailable', retryable: true },
      },
      {
        status: 200,
        body: {
          tripId: 7,
          targetKind: 'rental',
          targetId: 61,
          responsibility: contact,
          revision: 5,
        },
      }
    );
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let identity = {
      tripId: 7,
      client: first.client,
      labels,
      formatDate: (date: string): string => date,
    };
    const { result, rerender } = renderHook(
      () => useResponsibility(identity, { targetKind: 'rental', targetId: 61 }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={cache}>
            <ResponsibilitySessions identity={identity}>{children}</ResponsibilitySessions>
          </QueryClientProvider>
        ),
      }
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    const source = result.current.query.data;
    if (!source) throw new Error('Expected the canonical original assignment');
    await act(async () => {
      await result.current.save(source, contact);
    });
    const retryOriginal = result.current.retry;
    first.client.setConfig({ baseUrl: 'https://other-trips.example' });
    await act(async () => {
      await retryOriginal();
    });
    expect(first.writes).toHaveLength(1);
    first.client.setConfig({ baseUrl: 'http://arrangements.test' });
    identity = { ...identity, client: second.client };
    rerender();
    expect(result.current.failure).toBeUndefined();
    await act(async () => {
      await retryOriginal();
    });
    expect(first.writes).toHaveLength(1);
    expect(second.writes).toEqual([]);
    identity = { ...identity, client: first.client };
    rerender();
    expect(result.current.failure?.write.value).toEqual(contact);
    await act(async () => {
      await result.current.retry();
    });
    expect(first.writes).toHaveLength(2);
    expect(first.writes[1]).toEqual(first.writes[0]);
    expect(
      first.requests.every((request) => new URL(request.url).origin === 'http://arrangements.test')
    ).toBe(true);
    expect(result.current.failure).toBeUndefined();
  });
  it('isolates the retained request from mutable exposed failure data', async () => {
    const transport = arrangementsTransport();
    const contactA = { kind: 'contact', uri: 'pops:contacts/contact/issued-a' } as const;
    transport.replies.push(
      {
        status: 503,
        body: { code: 'trips.response_lost', message: 'Response unavailable', retryable: true },
      },
      {
        status: 200,
        body: {
          tripId: 7,
          targetKind: 'rental',
          targetId: 61,
          responsibility: contactA,
          revision: 5,
        },
      }
    );
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const identity = {
      tripId: 7,
      client: transport.client,
      labels,
      formatDate: (date: string): string => date,
    };
    const { result } = renderHook(
      () => useResponsibility(identity, { targetKind: 'rental', targetId: 61 }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={cache}>
            <ResponsibilitySessions identity={identity}>{children}</ResponsibilitySessions>
          </QueryClientProvider>
        ),
      }
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    const source = result.current.query.data;
    if (!source) throw new Error('Expected a canonical source');
    await act(async () => {
      await result.current.save(source, contactA);
    });
    const exposed = result.current.failure;
    if (!exposed || exposed.write.value?.kind !== 'contact')
      throw new Error('Expected the failed Contact A intent');
    exposed.write.source.revision = 99;
    exposed.write.source.tripId = 99;
    exposed.write.source.targetId = 99;
    exposed.write.value.uri = 'pops:contacts/contact/issued-b';
    await act(async () => {
      await result.current.retry();
    });
    expect(transport.writes).toEqual([
      {
        method: 'PUT',
        path: '/trips/7/responsibilities/rental/61',
        body: { expectedRevision: 4, responsibility: contactA },
      },
      {
        method: 'PUT',
        path: '/trips/7/responsibilities/rental/61',
        body: { expectedRevision: 4, responsibility: contactA },
      },
    ]);
    expect(result.current.failure).toBeUndefined();
    expect(result.current.query.data?.responsibility).toEqual(contactA);
  });
});
