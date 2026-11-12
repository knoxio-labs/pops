import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createClient } from '../trips-api/client';
import { IdeaCreateContext } from './IdeaCreateContext';
import { captureResult, captureSource, deferred, sourceIdea } from './test-utils';

import type { IdeaCreateContextProps } from './IdeaCreateContext';
import type { CaptureResult } from './types';

const caches: QueryClient[] = [];
const translation = createInstance();
beforeEach(async () => {
  await translation.init({ lng: 'en-AU', resources: {} });
});
afterEach(() => {
  cleanup();
  caches.forEach((cache) => cache.clear());
  caches.length = 0;
});

function fixture() {
  const writes: unknown[] = [];
  let lose = false;
  let pending: ReturnType<typeof deferred<Response>> | undefined;
  let malformed = false;
  let failRead = false;
  let ideaTripId = 1;
  const client = createClient({
    baseUrl: 'https://idea-owner.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/trips/1/capture-workspace')
        return failRead
          ? Response.json(
              { code: 'trips.unavailable', message: 'Source unavailable', retryable: true },
              { status: 503 }
            )
          : Response.json(captureSource());
      if (request.method !== 'POST' || path !== '/trips/1/ideas/create')
        throw new Error(`Unexpected request ${request.method} ${path}`);
      const body = z
        .object({
          operationId: z.uuid(),
          command: z.object({
            kind: z.literal('idea.create'),
            input: z.object({ name: z.string().nullable() }),
          }),
        })
        .parse(await request.json());
      writes.push(body);
      const result = captureResult(body, {
        ...captureSource(),
        ideas: malformed
          ? []
          : [sourceIdea({ id: 42, tripId: ideaTripId, name: body.command.input.name })],
      });
      if (lose) {
        lose = false;
        throw new TypeError('Lost creation reply');
      }
      if (pending) return pending.promise;
      return Response.json(result);
    },
  });
  return {
    client,
    writes,
    failRead: () => {
      failRead = true;
    },
    wrongTrip: () => {
      ideaTripId = 2;
    },
    loseReply: () => {
      lose = true;
    },
    malformed: (value: boolean) => {
      malformed = value;
    },
    defer: () => {
      pending = deferred<Response>();
      return pending;
    },
  };
}

function mount(props: Partial<IdeaCreateContextProps> = {}, cache = new QueryClient()) {
  caches.push(cache);
  const created = vi.fn<IdeaCreateContextProps['onCreated']>();
  const element = (next = props) => (
    <I18nextProvider i18n={translation}>
      <QueryClientProvider client={cache}>
        <IdeaCreateContext tripId={1} onCreated={created} {...next} />
      </QueryClientProvider>
    </I18nextProvider>
  );
  const rendered = render(element());
  return {
    ...rendered,
    cache,
    created,
    update: (next: Partial<IdeaCreateContextProps>) => rendered.rerender(element(next)),
  };
}

it('creates an independent Idea with verbatim Name, confirmed identity and owning cache invalidation', async () => {
  const owner = fixture();
  const { cache, created } = mount({ client: owner.client });
  const invalidate = vi.spyOn(cache, 'invalidateQueries');
  fireEvent.change(await screen.findByLabelText('Name'), {
    target: { value: '  A quiet island  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith({ kind: 'idea', id: 42 }));
  expect(owner.writes).toEqual([
    {
      operationId: expect.any(String),
      command: { kind: 'idea.create', input: { name: '  A quiet island  ' } },
    },
  ]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips', 'https://idea-owner.test', 1] });
});

it('keeps an unsaved Name and retries a failed command with the same UUID and body after remount', async () => {
  const owner = fixture();
  const first = mount({ client: owner.client });
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Retained idea' } });
  first.unmount();
  const second = mount({ client: owner.client }, first.cache);
  expect(await screen.findByLabelText('Name')).toHaveValue('Retained idea');
  owner.loseReply();
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await screen.findByRole('alert');
  expect(second.created).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Create Idea' })).toBeDisabled();
  second.unmount();
  const third = mount({ client: owner.client }, first.cache);
  expect(await screen.findByLabelText('Name')).toHaveValue('Retained idea');
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(third.created).toHaveBeenCalledWith({ kind: 'idea', id: 42 }));
  expect(owner.writes).toHaveLength(2);
  expect(owner.writes[0]).toEqual(owner.writes[1]);
});

it('does not deliver a late creation to a closed view and reopens its confirmed original without another POST', async () => {
  const owner = fixture();
  const pending = owner.defer();
  const first = mount({ client: owner.client });
  await screen.findByLabelText('Name');
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await waitFor(() => expect(owner.writes).toHaveLength(1));
  first.unmount();
  const body = z.object({ operationId: z.string() }).parse(owner.writes[0]);
  const result: CaptureResult = captureResult(
    { operationId: body.operationId, command: { kind: 'idea.create', input: { name: null } } },
    { ...captureSource(), ideas: [sourceIdea({ id: 42 })] }
  );
  await act(async () => {
    pending.resolve(Response.json(result));
  });
  expect(first.created).not.toHaveBeenCalled();
  const second = mount({ client: owner.client }, first.cache);
  fireEvent.click(await screen.findByRole('button', { name: 'Open created Idea' }));
  expect(second.created).toHaveBeenCalledWith({ kind: 'idea', id: 42 });
  expect(owner.writes).toHaveLength(1);
});

it('does not deliver a pending operation through a replaced callback', async () => {
  const owner = fixture();
  const pending = owner.defer();
  const first = mount({ client: owner.client });
  await screen.findByLabelText('Name');
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await waitFor(() => expect(owner.writes).toHaveLength(1));
  const replacement = vi.fn<IdeaCreateContextProps['onCreated']>();
  first.update({ client: owner.client, onCreated: replacement });
  const body = z.object({ operationId: z.string() }).parse(owner.writes[0]);
  await act(async () => {
    pending.resolve(
      Response.json(
        captureResult(
          { operationId: body.operationId, command: { kind: 'idea.create', input: {} } },
          { ...captureSource(), ideas: [sourceIdea({ id: 42 })] }
        )
      )
    );
  });
  expect(first.created).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Open created Idea' }));
  expect(replacement).toHaveBeenCalledWith({ kind: 'idea', id: 42 });
});

it('rejects an unconfirmed Idea identity and preserves exact retry instead of reporting creation', async () => {
  const owner = fixture();
  owner.malformed(true);
  const { created } = mount({ client: owner.client });
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Unconfirmed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await screen.findByText('trips.idea.response_invalid');
  expect(created).not.toHaveBeenCalled();
  owner.malformed(false);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith({ kind: 'idea', id: 42 }));
  expect(owner.writes[0]).toEqual(owner.writes[1]);
});

it('fences a changed origin before dispatch and excludes a different client from the retained draft', async () => {
  const owner = fixture();
  const first = mount({ client: owner.client });
  fireEvent.change(await screen.findByLabelText('Name'), {
    target: { value: 'Original owner draft' },
  });
  owner.client.setConfig({ baseUrl: 'https://replaced.test' });
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  expect(owner.writes).toEqual([]);
  const replacement = fixture();
  first.update({ client: replacement.client });
  expect(await screen.findByLabelText('Name')).toHaveValue('');
});

it('retains pending creation after query eviction and source outage without hiding either recovery action', async () => {
  const owner = fixture();
  const first = mount({ client: owner.client });
  fireEvent.change(await screen.findByLabelText('Name'), {
    target: { value: 'Retained through outage' },
  });
  owner.loseReply();
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await screen.findByRole('alert');
  first.unmount();
  first.cache.removeQueries();
  owner.failRead();
  const second = mount({ client: owner.client }, first.cache);
  expect(await screen.findByLabelText('Name')).toHaveValue('Retained through outage');
  await screen.findByText('Source unavailable');
  const form = screen.getByRole('form', { name: 'New Idea' });
  fireEvent.click(within(form).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(second.created).toHaveBeenCalledWith({ kind: 'idea', id: 42 }));
  expect(owner.writes[0]).toEqual(owner.writes[1]);
});

it('allows a stable callback rerender while creation is pending without losing confirmed delivery', async () => {
  const owner = fixture();
  const pending = owner.defer();
  const first = mount({ client: owner.client });
  await screen.findByLabelText('Name');
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await waitFor(() => expect(owner.writes).toHaveLength(1));
  first.update({ client: owner.client, onCreated: first.created });
  const body = z.object({ operationId: z.string() }).parse(owner.writes[0]);
  await act(async () => {
    pending.resolve(
      Response.json(
        captureResult(
          { operationId: body.operationId, command: { kind: 'idea.create', input: {} } },
          { ...captureSource(), ideas: [sourceIdea({ id: 42 })] }
        )
      )
    );
  });
  expect(first.created).toHaveBeenCalledOnce();
  expect(first.created).toHaveBeenCalledWith({ kind: 'idea', id: 42 });
});

it('rejects a created Idea belonging to another Trip before invoking the host', async () => {
  const owner = fixture();
  owner.wrongTrip();
  const { created } = mount({ client: owner.client });
  await screen.findByLabelText('Name');
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await screen.findByText('trips.idea.response_invalid');
  expect(created).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Create Idea' })).toBeDisabled();
});

it('settles a validated in-flight receipt into its original owner after the live origin changes', async () => {
  const owner = fixture();
  const pending = owner.defer();
  const first = mount({ client: owner.client });
  const secondOriginKey = ['trips', 'https://replacement.test', 1, 'capture_workspace'];
  const secondOriginSource = { marker: 'Untouched second origin' };
  first.cache.setQueryData(secondOriginKey, secondOriginSource);
  const invalidate = vi.spyOn(first.cache, 'invalidateQueries');
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Original receipt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Idea' }));
  await waitFor(() => expect(owner.writes).toHaveLength(1));
  owner.client.setConfig({ baseUrl: 'https://replacement.test' });
  first.update({ client: owner.client, onCreated: first.created });
  const body = z.object({ operationId: z.string() }).parse(owner.writes[0]);
  await act(async () => {
    pending.resolve(
      Response.json(
        captureResult(
          {
            operationId: body.operationId,
            command: { kind: 'idea.create', input: { name: 'Original receipt' } },
          },
          { ...captureSource(), ideas: [sourceIdea({ id: 42, name: 'Original receipt' })] }
        )
      )
    );
  });
  expect(first.created).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips', 'https://idea-owner.test', 1] });
  expect(invalidate).not.toHaveBeenCalledWith({
    queryKey: ['trips', 'https://replacement.test', 1],
  });
  expect(first.cache.getQueryData(secondOriginKey)).toEqual(secondOriginSource);
  first.unmount();
  first.cache.removeQueries({
    queryKey: ['trips', 'https://idea-owner.test', 1, 'idea-create-source'],
  });
  owner.failRead();
  owner.client.setConfig({ baseUrl: 'https://idea-owner.test' });
  const restored = mount({ client: owner.client }, first.cache);
  await screen.findByText('Source unavailable');
  fireEvent.click(await screen.findByRole('button', { name: 'Open created Idea' }));
  expect(restored.created).toHaveBeenCalledWith({ kind: 'idea', id: 42 });
  expect(owner.writes).toHaveLength(1);
});
