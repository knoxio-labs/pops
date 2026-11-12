import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

import { createClient } from '../trips-api/client';
import { CaptureWorkspace } from './CaptureWorkspace';
import { captureSource, deferred, sourceIdea } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

function owner() {
  const commands: unknown[] = [];
  let source = { ...captureSource(), ideas: [sourceIdea()] };
  let conflict = true;
  let nextRead: Promise<Response> | undefined;
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === 'GET') {
      if (path.endsWith('/capture-workspace')) {
        const pending = nextRead;
        nextRead = undefined;
        return pending ?? Response.json(source);
      }
      if (path.endsWith('/places')) return Response.json({ places: [] });
      if (path.endsWith('/visits')) return Response.json({ visits: [] });
      throw new Error(`Unexpected read ${path}`);
    }
    if (!path.endsWith('/ideas/update')) throw new Error(`Unexpected write ${path}`);
    const body: unknown = await request.json();
    commands.push(body);
    if (conflict)
      return Response.json(
        {
          code: 'trips.source.source_revision_conflict',
          message: 'Changed elsewhere',
          retryable: false,
        },
        { status: 409 }
      );
    const command = z
      .object({
        operationId: z.uuid(),
        command: z.object({
          kind: z.literal('idea.update'),
          id: z.literal(1),
          expectedRevision: z.number(),
          input: z.object({ notes: z.string() }),
        }),
      })
      .parse(body);
    const row = source.ideas[0];
    if (!row || row.revision !== command.command.expectedRevision) throw new Error('Stale CAS');
    source = {
      ...source,
      ideas: [{ ...row, notes: command.command.input.notes, revision: row.revision + 1 }],
    };
    return Response.json({
      receipt: { ...source, operationId: command.operationId, undoneOperationId: null },
      current: source,
      replayed: false,
      undone: false,
    });
  };
  const client = createClient({ baseUrl: 'http://owner-a.test', fetch: transport });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  return {
    client,
    cache,
    commands,
    source: () => source,
    current: () => {
      conflict = false;
      source = { ...source, ideas: [sourceIdea({ revision: 3, notes: 'Canonical foreign note' })] };
    },
    deferRead: (response: Promise<Response>) => {
      nextRead = response;
    },
    mount: () =>
      render(
        <QueryClientProvider client={cache}>
          <CaptureWorkspace
            tripId={1}
            client={client}
            view="capture"
            selectedSource={{ kind: 'idea', id: 1 }}
          />
        </QueryClientProvider>
      ),
  };
}

async function rejectedEdit() {
  const fixture = owner();
  const mounted = fixture.mount();
  const user = userEvent.setup();
  const notes = await screen.findByRole('textbox', { name: 'Idea notes' });
  await user.type(notes, 'Retained local note');
  await user.tab();
  await screen.findByRole('region', { name: 'Edit Idea failed' });
  return { ...fixture, mounted, user };
}

it('keeps rejected fields through Reload, then explicitly discards only that row and saves a new current-CAS intent', async () => {
  const fixture = await rejectedEdit();
  expect(screen.queryByRole('button', { name: 'Retry Edit Idea' })).not.toBeInTheDocument();
  const discard = screen.getByRole('button', { name: 'Discard unsaved Idea edits' });
  expect(discard).toBeDisabled();
  fixture.current();
  await fixture.user.click(screen.getByRole('button', { name: 'Reload source' }));
  await waitFor(() => expect(discard).toBeEnabled());
  expect(fixture.commands).toHaveLength(1);
  const retainedNotes = screen.getByRole('textbox', { name: 'Idea notes' });
  expect(retainedNotes).toHaveValue('Retained local note');
  await fixture.user.click(retainedNotes);
  await fixture.user.tab();
  expect(fixture.commands).toHaveLength(1);
  await fixture.user.click(discard);
  expect(fixture.commands).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Idea notes' })).toHaveValue('Canonical foreign note');
  expect(screen.queryByRole('region', { name: 'Edit Idea failed' })).not.toBeInTheDocument();
  const notes = screen.getByRole('textbox', { name: 'Idea notes' });
  await fixture.user.clear(notes);
  await fixture.user.type(notes, 'New explicit edit');
  await fixture.user.tab();
  await waitFor(() => expect(fixture.commands).toHaveLength(2));
  const first = z.object({ operationId: z.uuid() }).parse(fixture.commands[0]);
  expect(fixture.commands[1]).toMatchObject({
    command: {
      kind: 'idea.update',
      id: 1,
      expectedRevision: 3,
      input: { notes: 'New explicit edit' },
    },
  });
  expect(z.object({ operationId: z.uuid() }).parse(fixture.commands[1]).operationId).not.toBe(
    first.operationId
  );
});

it('cannot use a late read after owner drift or close to unlock discard; restoration requires a fresh explicit read', async () => {
  const fixture = await rejectedEdit();
  fixture.current();
  const response = deferred<Response>();
  fixture.deferRead(response.promise);
  await fixture.user.click(screen.getByRole('button', { name: 'Reload source' }));
  fixture.client.setConfig({ baseUrl: 'http://owner-b.test' });
  response.resolve(Response.json(fixture.source()));
  await screen.findByText('Restore the original Trips owner before retrying this operation.');
  expect(screen.getByRole('button', { name: 'Discard unsaved Idea edits' })).toBeDisabled();
  fixture.client.setConfig({ baseUrl: 'http://owner-a.test' });
  const closed = deferred<Response>();
  fixture.deferRead(closed.promise);
  await fixture.user.click(screen.getByRole('button', { name: 'Reload source' }));
  fixture.mounted.unmount();
  closed.resolve(Response.json(fixture.source()));
  fixture.mount();
  expect(await screen.findByRole('textbox', { name: 'Idea notes' })).toHaveValue(
    'Retained local note'
  );
  expect(screen.getByRole('button', { name: 'Discard unsaved Idea edits' })).toBeDisabled();
  await fixture.user.click(screen.getByRole('button', { name: 'Reload source' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Discard unsaved Idea edits' })).toBeEnabled()
  );
  expect(fixture.commands).toHaveLength(1);
});
