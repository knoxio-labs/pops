import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, writeMock, releaseMock, heartbeatMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  writeMock: vi.fn(),
  releaseMock: vi.fn(),
  heartbeatMock: vi.fn(),
}));
vi.mock('../../../finance-api/index.js', () => ({
  importDraftsCreate: (...args: unknown[]) => createMock(...args),
  importDraftsWrite: (...args: unknown[]) => writeMock(...args),
  importDraftsRelease: (...args: unknown[]) => releaseMock(...args),
  importDraftsHeartbeat: (...args: unknown[]) => heartbeatMock(...args),
}));

import { resetOwnerTokenForTests } from '../../../store/import-draft-owner';
import { initialState } from '../../../store/import-store-types';
import { useImportStore } from '../../../store/importStore';
import {
  DRAFT_HEARTBEAT_MS,
  DRAFT_WRITE_DEBOUNCE_MS,
  IMPORT_DRAFTS_LIST_KEY,
  startDraftWriteThrough,
  useDraftWriteThrough,
} from './useDraftWriteThrough';

const summary = { id: 'draft-1', state: 'open' };

function ok(data: unknown) {
  return { data: { data }, error: undefined, response: new Response(null, { status: 200 }) };
}

function ownedElsewhere() {
  return {
    data: undefined,
    error: { message: 'Import draft draft-1 is open elsewhere', code: 'DraftOwnedElsewhere' },
    response: new Response(null, { status: 409 }),
  };
}

const callbacks = {
  onOwnedElsewhere: vi.fn(),
  onSaveFailed: vi.fn(),
  onDraftListChanged: vi.fn(),
};

let stop: (() => void) | null = null;

function stopNow(): void {
  stop?.();
  stop = null;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function setKnownDraft(id = 'draft-1'): void {
  useImportStore.setState({
    ...initialState,
    draftId: id,
    accountId: 'acc-1',
    rows: [{ Date: '01/01/2026' }],
    headers: ['Date'],
  });
}

function startOnDraft(id = 'draft-1'): void {
  setKnownDraft(id);
  stop = startDraftWriteThrough(callbacks);
}

function renderWriteThrough() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const rendered = renderHook(
    () =>
      useDraftWriteThrough({
        enabled: true,
        epoch: 0,
        onOwnedElsewhere: vi.fn(),
        onSaveFailed: vi.fn(),
      }),
    { wrapper }
  );
  return { ...rendered, invalidateSpy };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetOwnerTokenForTests();
  sessionStorage.clear();
  createMock.mockResolvedValue(ok(summary));
  writeMock.mockResolvedValue(ok(summary));
  releaseMock.mockResolvedValue({ data: undefined, error: undefined });
  heartbeatMock.mockResolvedValue(ok(summary));
  useImportStore.setState({ ...initialState });
});

afterEach(() => {
  stopNow();
  vi.useRealTimers();
});

describe('creating the draft', () => {
  it('creates a draft the first time the store has an account and rows, and puts the id in the store', async () => {
    useImportStore.setState({ ...initialState });
    stop = startDraftWriteThrough(callbacks);

    useImportStore.getState().setAccount('acc-1', 'Amex');
    expect(createMock).not.toHaveBeenCalled();

    useImportStore.setState({ headers: ['Date'], rows: [{ Date: '01/01/2026' }] });
    await flushPromises();

    expect(createMock).toHaveBeenCalledOnce();
    const body = createMock.mock.calls[0]?.[0].body;
    expect(body).toMatchObject({ accountId: 'acc-1', rowCount: 1, step: 1 });
    expect(body.ownerToken).toHaveLength(36);
    expect(useImportStore.getState().draftId).toBe('draft-1');
    expect(callbacks.onDraftListChanged).toHaveBeenCalledOnce();
  });

  it('creates once even when several changes arrive before the id is known, then writes what changed meanwhile', async () => {
    useImportStore.setState({ ...initialState, accountId: 'acc-1' });
    stop = startDraftWriteThrough(callbacks);

    useImportStore.setState({ headers: ['Date'], rows: [{ Date: '01/01/2026' }] });
    useImportStore.setState({ rows: [{ Date: '01/01/2026' }, { Date: '02/01/2026' }] });
    await flushPromises();

    expect(createMock).toHaveBeenCalledOnce();
    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock.mock.calls[0]?.[0].body.rowCount).toBe(2);
  });

  it('does not create for a run that already committed', async () => {
    useImportStore.setState({
      ...initialState,
      accountId: 'acc-1',
      commitResult: {
        entitiesCreated: 0,
        rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
        tagRulesApplied: 0,
        transactionsImported: 1,
        transactionsFailed: 0,
        failedDetails: [],
        retroactiveReclassifications: 0,
      },
    });
    stop = startDraftWriteThrough(callbacks);
    useImportStore.setState({ rows: [{ Date: '01/01/2026' }] });
    await flushPromises();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('writing through', () => {
  it('writes at once on a step change', async () => {
    startOnDraft();
    useImportStore.getState().nextStep();
    await flushPromises();

    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'draft-1' },
      body: { step: 2, release: false },
      keepalive: false,
    });
  });

  it('coalesces other changes into one write two seconds after the last', async () => {
    startOnDraft();
    useImportStore.getState().markChecksumsResolved(['a']);
    useImportStore.getState().markChecksumsResolved(['b']);
    vi.advanceTimersByTime(DRAFT_WRITE_DEBOUNCE_MS - 1);
    expect(writeMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock.mock.calls[0]?.[0].body.payload.manuallyResolvedChecksums).toEqual(['a', 'b']);
  });

  it('ignores changes to fields the draft does not hold', async () => {
    startOnDraft();
    useImportStore.setState({ files: [new File(['x'], 'x.csv')] });
    vi.advanceTimersByTime(DRAFT_WRITE_DEBOUNCE_MS);
    await flushPromises();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('flushes what is pending on pagehide with keepalive and releases in the same request', async () => {
    startOnDraft();
    useImportStore.getState().markChecksumsResolved(['a']);
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();

    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock.mock.calls[0]?.[0]).toMatchObject({
      body: { release: true },
      keepalive: true,
    });
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('releases on pagehide when nothing is pending', async () => {
    startOnDraft();
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();
    expect(writeMock).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalledOnce();
    expect(releaseMock.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'draft-1' },
      keepalive: true,
    });
  });

  it('stopping flushes pending changes with release, or releases when clean', async () => {
    startOnDraft();
    stopNow();
    await flushPromises();
    expect(releaseMock).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    startOnDraft();
    useImportStore.getState().markChecksumsResolved(['a']);
    stopNow();
    await flushPromises();
    expect(writeMock).toHaveBeenCalledOnce();
    expect(writeMock.mock.calls[0]?.[0].body.release).toBe(true);
    expect(releaseMock).not.toHaveBeenCalled();
  });
});

describe('losing the lease', () => {
  it('stops writing after a 409 DraftOwnedElsewhere and reports it once', async () => {
    startOnDraft();
    writeMock.mockResolvedValueOnce(ownedElsewhere());
    useImportStore.getState().nextStep();
    await flushPromises();
    expect(callbacks.onOwnedElsewhere).toHaveBeenCalledOnce();

    useImportStore.getState().nextStep();
    vi.advanceTimersByTime(DRAFT_WRITE_DEBOUNCE_MS);
    await flushPromises();
    expect(writeMock).toHaveBeenCalledOnce();

    stopNow();
    await flushPromises();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('reports other failures and keeps trying on the next change', async () => {
    startOnDraft();
    writeMock.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'nope' },
      response: new Response(null, { status: 503 }),
    });
    useImportStore.getState().nextStep();
    await flushPromises();
    expect(callbacks.onSaveFailed).toHaveBeenCalledOnce();

    useImportStore.getState().nextStep();
    await flushPromises();
    expect(writeMock).toHaveBeenCalledTimes(2);
  });
});

describe('heartbeat', () => {
  it('beats every thirty seconds while a draft is known, and stops when stopped', async () => {
    startOnDraft();
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS - 1);
    expect(heartbeatMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(heartbeatMock).toHaveBeenCalledOnce();
    expect(heartbeatMock.mock.calls[0]?.[0]).toMatchObject({ path: { id: 'draft-1' } });
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    expect(heartbeatMock).toHaveBeenCalledTimes(2);

    stopNow();
    await flushPromises();
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS * 3);
    expect(heartbeatMock).toHaveBeenCalledTimes(2);
  });

  it('starts beating once a fresh run has created its draft', async () => {
    useImportStore.setState({ ...initialState, accountId: 'acc-1' });
    stop = startDraftWriteThrough(callbacks);
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    expect(heartbeatMock).not.toHaveBeenCalled();

    useImportStore.setState({ headers: ['Date'], rows: [{ Date: '01/01/2026' }] });
    await flushPromises();
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    expect(heartbeatMock).toHaveBeenCalledOnce();
  });

  it('a 409 on the heartbeat latches the lease as lost: no more beats, no more writes', async () => {
    startOnDraft();
    heartbeatMock.mockResolvedValueOnce(ownedElsewhere());
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    await flushPromises();
    expect(callbacks.onOwnedElsewhere).toHaveBeenCalledOnce();

    useImportStore.getState().nextStep();
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    await flushPromises();
    expect(writeMock).not.toHaveBeenCalled();
    expect(heartbeatMock).toHaveBeenCalledOnce();
  });

  it('a transient heartbeat failure is ignored', async () => {
    startOnDraft();
    heartbeatMock.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'down' },
      response: new Response(null, { status: 503 }),
    });
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    await flushPromises();
    expect(callbacks.onOwnedElsewhere).not.toHaveBeenCalled();
    expect(callbacks.onSaveFailed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    expect(heartbeatMock).toHaveBeenCalledTimes(2);
  });
});

describe('pending import list invalidation', () => {
  it('invalidates after a successful step write', async () => {
    setKnownDraft();
    const { invalidateSpy, unmount } = renderWriteThrough();

    await act(async () => {
      useImportStore.getState().nextStep();
      await flushPromises();
    });

    expect(writeMock).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: IMPORT_DRAFTS_LIST_KEY });
    unmount();
    await flushPromises();
  });

  it('invalidates after a successful release', async () => {
    setKnownDraft();
    const { invalidateSpy, unmount } = renderWriteThrough();

    unmount();
    await flushPromises();

    expect(releaseMock).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: IMPORT_DRAFTS_LIST_KEY });
  });

  it('does not invalidate after payload writes or heartbeats', async () => {
    setKnownDraft();
    const { invalidateSpy, unmount } = renderWriteThrough();

    await act(async () => {
      useImportStore.getState().markChecksumsResolved(['a']);
      vi.advanceTimersByTime(DRAFT_WRITE_DEBOUNCE_MS);
      await flushPromises();
    });
    vi.advanceTimersByTime(DRAFT_HEARTBEAT_MS);
    await flushPromises();

    expect(writeMock).toHaveBeenCalledOnce();
    expect(heartbeatMock).toHaveBeenCalledOnce();
    expect(invalidateSpy).not.toHaveBeenCalled();
    unmount();
    await flushPromises();
  });

  it('does not invalidate after a failed step write or release', async () => {
    setKnownDraft();
    const { invalidateSpy, unmount } = renderWriteThrough();
    writeMock.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'write failed' },
      response: new Response(null, { status: 503 }),
    });

    await act(async () => {
      useImportStore.getState().nextStep();
      await flushPromises();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    releaseMock.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'release failed' },
      response: new Response(null, { status: 503 }),
    });
    unmount();
    await flushPromises();

    expect(releaseMock).toHaveBeenCalledOnce();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
