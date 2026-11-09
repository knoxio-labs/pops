import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { decisionQueryKey } from './api';
import { DecisionWorkspace } from './DecisionWorkspace';
import { decisionTransport, sourceDecision } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function mount(transport = decisionTransport()) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  const props = { tripId: 7, decisionId: 8, client: transport.client };
  const view = render(
    <QueryClientProvider client={cache}>
      <DecisionWorkspace {...props} />
    </QueryClientProvider>
  );
  return { cache, props, transport, view };
}
it('edits an independent question with failed context, sends only explicit fields and undoes its own confirmed edit', async () => {
  const { transport } = mount();
  const question = await screen.findByLabelText('Question');
  expect(await screen.findByText('journey 24 · Source unavailable')).toBeVisible();
  fireEvent.change(question, { target: { value: 'New source question' } });
  fireEvent.blur(question);
  await waitFor(() => expect(transport.snapshot().decision.revision).toBe(1));
  expect(transport.requests.filter((request) => request.method === 'PATCH')[0]?.body).toEqual({
    question: 'New source question',
    expectedRevision: 0,
  });
  const undo = screen.getByRole('button', { name: 'Undo' });
  await waitFor(() => expect(undo).toBeEnabled());
  fireEvent.click(undo);
  await waitFor(() => expect(transport.snapshot().decision.revision).toBe(2));
  expect(transport.requests.filter((request) => request.method === 'PATCH')[1]?.body).toEqual({
    question: 'Which departure?',
    expectedRevision: 1,
  });
  await waitFor(() => expect(question).toHaveValue('Which departure?'));
  expect(screen.getByLabelText('Option 1 notes')).toHaveValue('Independent option notes');
});
it('keeps a dirty draft mounted after background read failure and cancels without writing', async () => {
  const { transport, cache, props } = mount();
  const question = await screen.findByLabelText('Question');
  fireEvent.change(question, { target: { value: 'Retained draft' } });
  transport.failRead(true);
  await act(async () => {
    await cache.invalidateQueries({ queryKey: decisionQueryKey(props) });
  });
  expect(screen.getByLabelText('Question')).toBe(question);
  expect(question).toHaveValue('Retained draft');
  fireEvent.keyDown(question, { key: 'Escape' });
  expect(question).toHaveValue('Which departure?');
  fireEvent.blur(question);
  expect(transport.requests.filter((request) => request.method !== 'GET')).toHaveLength(0);
});
it('retains failed drafts and errors, then retries with the original revision', async () => {
  const { transport } = mount();
  transport.failWrite(true);
  const question = await screen.findByLabelText('Question');
  fireEvent.change(question, { target: { value: 'Unsaved question' } });
  fireEvent.blur(question);
  const retry = await screen.findByRole('button', { name: 'Retry Edit decision' });
  expect(question).toHaveValue('Unsaved question');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  transport.failWrite(false);
  fireEvent.click(retry);
  await waitFor(() => expect(transport.snapshot().decision.question).toBe('Unsaved question'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  expect(
    transport.requests
      .filter((request) => request.method === 'PATCH')
      .map((request) => request.body)
  ).toEqual([
    { question: 'Unsaved question', expectedRevision: 0 },
    { question: 'Unsaved question', expectedRevision: 0 },
  ]);
});
it('clears Undo and requires explicit review when a newer source arrives during a dirty edit', async () => {
  const { cache, props } = mount();
  const question = await screen.findByLabelText('Question');
  fireEvent.change(question, { target: { value: 'Local intent' } });
  await act(async () => {
    cache.setQueryData(decisionQueryKey(props), sourceDecision(3));
  });
  expect(await screen.findByText(/The source changed. Your drafts are retained/)).toBeVisible();
  expect(question).toHaveValue('Local intent');
  expect(question).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});
it('renders no fabricated editable source on initial failure and resets drafts across API origins', async () => {
  const failed = decisionTransport();
  failed.failRead(true);
  const first = mount(failed);
  await waitFor(() =>
    expect(first.transport.requests.some((request) => request.path.endsWith('/workspace'))).toBe(
      true
    )
  );
  expect(screen.queryByLabelText('Question')).not.toBeInTheDocument();
  first.view.unmount();
  const second = mount();
  const question = await screen.findByLabelText('Question');
  fireEvent.change(question, { target: { value: 'Old origin draft' } });
  const other = decisionTransport();
  other.client.setConfig({ baseUrl: 'https://other-origin.test' });
  second.view.rerender(
    <QueryClientProvider client={second.cache}>
      <DecisionWorkspace tripId={7} decisionId={8} client={other.client} />
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByLabelText('Question')).toHaveValue('Which departure?'));
});

it('discards the old field draft after a confirmed retry so a later clean source can replace it', async () => {
  const { transport, cache, props } = mount();
  transport.failWrite(true);
  const field = await screen.findByLabelText('Question');
  fireEvent.change(field, { target: { value: 'Retry me' } });
  fireEvent.blur(field);
  const retry = await screen.findByRole('button', { name: 'Retry Edit decision' });
  transport.failWrite(false);
  fireEvent.click(retry);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  const next = sourceDecision(2);
  next.decision.question = 'Later canonical question';
  await act(async () => {
    cache.setQueryData(decisionQueryKey(props), next);
  });
  await waitFor(() => expect(field).toHaveValue('Later canonical question'));
  expect(screen.queryByText(/The source changed. Your drafts/)).not.toBeInTheDocument();
});
it('retains a failed Undo in the UI and retries it at its original revision', async () => {
  const { transport } = mount();
  const question = await screen.findByLabelText('Question');
  fireEvent.change(question, { target: { value: 'Temporary question' } });
  fireEvent.blur(question);
  const undo = screen.getByRole('button', { name: 'Undo' });
  await waitFor(() => expect(undo).toBeEnabled());
  transport.failWrite(true);
  fireEvent.click(undo);
  const retry = await screen.findByRole('button', { name: 'Retry Undo' });
  expect(question).toHaveValue('Temporary question');
  expect(undo).toBeEnabled();
  transport.failWrite(false);
  fireEvent.click(retry);
  await waitFor(() => expect(question).toHaveValue('Which departure?'));
  expect(
    transport.requests
      .filter((request) => request.method === 'PATCH')
      .map((request) => request.body)
  ).toEqual([
    { question: 'Temporary question', expectedRevision: 0 },
    { question: 'Which departure?', expectedRevision: 1 },
    { question: 'Which departure?', expectedRevision: 1 },
  ]);
  await waitFor(() => expect(undo).toBeDisabled());
});
