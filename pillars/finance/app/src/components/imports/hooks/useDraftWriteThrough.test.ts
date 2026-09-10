import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, writeMock, releaseMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  writeMock: vi.fn(),
  releaseMock: vi.fn(),
}));
vi.mock('../../../finance-api/index.js', () => ({
  importDraftsCreate: (...args: unknown[]) => createMock(...args),
  importDraftsWrite: (...args: unknown[]) => writeMock(...args),
  importDraftsRelease: (...args: unknown[]) => releaseMock(...args),
}));

import { resetOwnerTokenForTests } from '../../../store/import-draft-owner';
import { initialState } from '../../../store/import-store-types';
import { useImportStore } from '../../../store/importStore';
import { DRAFT_WRITE_DEBOUNCE_MS, startDraftWriteThrough } from './useDraftWriteThrough';

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
  onDraftCreated: vi.fn(),
};

let stop: (() => void) | null = null;

function stopNow(): void {
  stop?.();
  stop = null;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function startOnDraft(id = 'draft-1'): void {
  useImportStore.setState({
    ...initialState,
    draftId: id,
    accountId: 'acc-1',
    rows: [{ Date: '01/01/2026' }],
    headers: ['Date'],
  });
  stop = startDraftWriteThrough(callbacks);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetOwnerTokenForTests();
  sessionStorage.clear();
  createMock.mockResolvedValue(ok(summary));
  writeMock.mockResolvedValue(ok(summary));
  releaseMock.mockResolvedValue({ data: undefined, error: undefined });
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
    expect(callbacks.onDraftCreated).toHaveBeenCalledOnce();
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
