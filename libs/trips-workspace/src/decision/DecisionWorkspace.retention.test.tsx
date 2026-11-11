import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { DecisionWorkspace } from './DecisionWorkspace';
import { decisionTransport, sourceDecision } from './test-utils';
import { useDecisionEditor } from './use-decision-editor';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
function retainedWorkspace() {
  const transport = decisionTransport();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const props = { tripId: 7, decisionId: 8, client: transport.client };
  const content = (open: boolean) => (
    <QueryClientProvider client={cache}>
      {open && <DecisionWorkspace {...props} />}
    </QueryClientProvider>
  );
  const view = render(content(true));
  return {
    transport,
    close: () => view.rerender(content(false)),
    reopen: () => view.rerender(content(true)),
  };
}

it('retains unsaved fields and option and link composer strings across closing the source', async () => {
  const view = retainedWorkspace();
  fireEvent.change(await screen.findByLabelText('Question'), {
    target: { value: 'Uncommitted question' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
  fireEvent.change(screen.getByLabelText('Option name'), { target: { value: '   ' } });
  fireEvent.change(
    within(screen.getByRole('article', { name: 'Option 1' })).getByLabelText('Source URI'),
    {
      target: { value: 'not a resolved URI' },
    }
  );
  fireEvent.change(
    within(screen.getByRole('article', { name: 'Option 1' })).getByLabelText('Source label'),
    {
      target: { value: 'Unsubmitted source' },
    }
  );
  view.close();
  view.reopen();
  expect(await screen.findByLabelText('Question')).toHaveValue('Uncommitted question');
  expect(screen.getByLabelText('Option name')).toHaveValue('   ');
  expect(
    within(screen.getByRole('article', { name: 'Option 1' })).getByLabelText('Source URI')
  ).toHaveValue('not a resolved URI');
  expect(
    within(screen.getByRole('article', { name: 'Option 1' })).getByLabelText('Source label')
  ).toHaveValue('Unsubmitted source');
  expect(view.transport.requests.filter((request) => request.method !== 'GET')).toHaveLength(0);
});

it('retains failed commands and confirmed own Undo across remounts', async () => {
  const view = retainedWorkspace();
  view.transport.failWrite(true);
  const question = await screen.findByLabelText('Question');
  fireEvent.change(question, { target: { value: 'Failed question' } });
  fireEvent.blur(question);
  await screen.findByRole('button', { name: 'Retry Edit decision' });
  view.close();
  view.reopen();
  expect(await screen.findByLabelText('Question')).toHaveValue('Failed question');
  view.transport.failWrite(false);
  fireEvent.click(screen.getByRole('button', { name: 'Retry Edit decision' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  view.close();
  view.reopen();
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(view.transport.snapshot().decision.revision).toBe(2));
  expect(
    view.transport.requests
      .filter((request) => request.method === 'PATCH')
      .map((request) => request.body)
  ).toEqual([
    { question: 'Failed question', expectedRevision: 0 },
    { question: 'Failed question', expectedRevision: 0 },
    { question: 'Which departure?', expectedRevision: 1 },
  ]);
});

it.each(['origin change', 'view close'])(
  'blocks %s after asynchronous preparation and shares the lock across two views',
  async (boundary) => {
    const transport = decisionTransport();
    const cache = new QueryClient();
    caches.push(cache);
    let release: (() => void) | undefined;
    vi.spyOn(cache, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const props = { tripId: 7, decisionId: 8, client: transport.client };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    );
    const initial = sourceDecision();
    const first = renderHook(() => useDecisionEditor(initial, props), { wrapper });
    const second = renderHook(() => useDecisionEditor(initial, props), { wrapper });
    let pending: Promise<boolean> | undefined;
    act(() => {
      pending = first.result.current.editor.commit(
        { kind: 'edit-decision', fields: { question: 'Pending' } },
        'Edit decision'
      );
    });
    expect(second.result.current.state.busy).toBe(true);
    if (boundary === 'view close') first.unmount();
    else transport.client.setConfig({ baseUrl: 'https://changed.test' });
    await act(async () => {
      release?.();
      await pending;
    });
    expect(transport.requests).toHaveLength(0);
    expect(second.result.current.state.busy).toBe(false);
  }
);
