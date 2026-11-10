import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { RentalContextEditor } from '../index';
import { deferredRouteResponse, routeJson } from '../route/test-utils';
import { sourceVisits } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { labels, sourceRental } from './test-utils';

import type { RentalContext, RentalSourceContext } from '../index';

function transport(provider: string) {
  const requests: Request[] = [];
  let read = () => Promise.resolve(routeJson(sourceRental({ provider })));
  const client = createClient({
    baseUrl: 'http://rental.test',
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return read();
    },
  });
  return {
    client,
    requests,
    reply: (next: typeof read): void => {
      read = next;
    },
  };
}
afterEach(cleanup);
describe('Public contextual Rental editor', () => {
  it('reuses the canonical form and retains its draft through close and query-cache eviction', async () => {
    const owner = transport('Actual provider');
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const identity = { tripId: 7, client: owner.client, labels };
    const editor = (
      <QueryClientProvider client={cache}>
        <RentalContextEditor identity={identity} id={61} sources={{}} />
      </QueryClientProvider>
    );
    const first = render(editor);
    const user = userEvent.setup();
    const provider = await screen.findByLabelText(labels.provider);
    await user.clear(provider);
    await user.type(provider, 'Retained draft');
    first.unmount();
    cache.clear();
    render(editor);
    await waitFor(() =>
      expect(screen.getByLabelText(labels.provider)).toHaveValue('Retained draft')
    );
    expect(screen.getByLabelText(labels.start)).toHaveValue('2029-05-01');
    expect(screen.getByLabelText(labels.end)).toHaveValue('2029-05-09');
    expect(screen.queryByText('Documents')).not.toBeInTheDocument();
    expect(owner.requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('does not display or seed A source facts for a same-origin distinct B client', async () => {
    const a = transport('Provider A');
    const b = transport('Provider B');
    const pending = deferredRouteResponse();
    b.reply(() => pending.promise);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const editor = (identity: RentalContext) => (
      <QueryClientProvider client={cache}>
        <RentalContextEditor identity={identity} id={61} sources={{}} />
      </QueryClientProvider>
    );
    const identityA = { tripId: 7, client: a.client, labels };
    const view = render(editor(identityA));
    expect(await screen.findByLabelText(labels.provider)).toHaveValue('Provider A');
    view.rerender(editor({ ...identityA, client: b.client }));
    expect(screen.queryByLabelText(labels.provider)).not.toBeInTheDocument();
    await act(async () => {
      pending.resolve(routeJson(sourceRental({ provider: 'Provider B' })));
    });
    await waitFor(() => expect(screen.getByLabelText(labels.provider)).toHaveValue('Provider B'));
    view.rerender(editor(identityA));
    await waitFor(() => expect(screen.getByLabelText(labels.provider)).toHaveValue('Provider A'));
  });

  it.each([{ tripId: 8 }, { id: 62 }])('rejects a foreign canonical source %j', async (foreign) => {
    const owner = transport('Foreign');
    owner.reply(async () => routeJson(sourceRental(foreign)));
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cache}>
        <RentalContextEditor
          identity={{ tripId: 7, client: owner.client, labels }}
          id={61}
          sources={{}}
        />
      </QueryClientProvider>
    );
    await screen.findByText('web.request.failed');
    expect(screen.queryByLabelText(labels.provider)).not.toBeInTheDocument();
  });

  it('only offers actual owning-trip Visit IDs while preserving an unresolved stored endpoint', async () => {
    const owner = transport('Actual');
    owner.reply(async () => routeJson(sourceRental({ pickupVisitId: 999 })));
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const visit = sourceVisits[0]!;
    const sources: RentalSourceContext = { visits: [{ ...visit, tripId: 8, id: 999 }, visit] };
    render(
      <QueryClientProvider client={cache}>
        <RentalContextEditor
          identity={{ tripId: 7, client: owner.client, labels }}
          id={61}
          sources={sources}
        />
      </QueryClientProvider>
    );
    const pickup = await screen.findByRole('combobox', { name: labels.pickup });
    expect(pickup).toHaveValue('999');
    expect(screen.getByText('999')).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: labels.visitUnavailable })).toHaveLength(2);
    expect(owner.requests.every((request) => request.method === 'GET')).toBe(true);
  });
});
