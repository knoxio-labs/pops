import { beforeEach, describe, expect, it, vi } from 'vitest';

const readMock = vi.hoisted(() => vi.fn());
const writeMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../bfm-api/index.js', () => ({
  operatorGetDeviceGrant: readMock,
  operatorReplaceDeviceGrant: writeMock,
}));

import { createGrantRequests } from '../grant-requests';
import { initialSelection } from '../grant-selection';
import { DEVICE, grant } from './grant-fixtures';

import type { GrantSession } from '../types';

function setup() {
  let state: GrantSession = {
    target: DEVICE,
    open: true,
    phase: 'ready',
    grant: grant(),
    selection: ['session.read', 'purchases.read', 'documents.upload'],
    failure: null,
    saved: false,
  };
  const busy = { current: false },
    sequence = { current: 0 };
  const update = (next: GrantSession) => {
    state = next;
  };
  return {
    requests: createGrantRequests(() => state, update, sequence, busy),
    state: () => state,
    update,
    sequence,
    busy,
  };
}
function failed(status: number) {
  return {
    error: { code: 'device_grant_conflict', message: 'Refused' },
    response: new Response(null, { status }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('grant request boundary', () => {
  it('sends one complete selection and both exact CAS fields; adopts only the returned grant', async () => {
    const session = setup(),
      saved = grant({ revision: 5, stored: ['session.read'], effective: ['session.read'] });
    writeMock.mockResolvedValue({ data: saved });
    await session.requests.save();
    expect(writeMock).toHaveBeenCalledExactlyOnceWith({
      path: { id: DEVICE.id },
      body: {
        expectedRevision: 4,
        expectedPolicyToken: 'a'.repeat(64),
        capabilities: ['session.read', 'purchases.read', 'documents.upload'],
      },
    });
    expect(session.state()).toMatchObject({
      grant: saved,
      selection: initialSelection(saved),
      saved: true,
      phase: 'ready',
    });
  });
  it('does not send unavailable stored strings or silently remove them', async () => {
    const session = setup();
    session.update({ ...session.state(), grant: grant({ stored: ['future.example.read'] }) });
    await session.requests.save();
    expect(writeMock).not.toHaveBeenCalled();
    expect(session.state().grant?.stored).toEqual(['future.example.read']);
  });
  it('suppresses duplicate clicks synchronously while the write is pending', async () => {
    const session = setup();
    let complete: ((value: { data: ReturnType<typeof grant> }) => void) | undefined;
    writeMock.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const first = session.requests.save();
    await session.requests.save();
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(session.busy.current).toBe(true);
    complete?.({ data: grant() });
    await first;
    expect(session.busy.current).toBe(false);
  });
  it.each([409, 400, 403, 404])(
    'locks a refused %i write without replay or background read',
    async (status) => {
      const session = setup(),
        selected = [...session.state().selection];
      writeMock.mockResolvedValue(failed(status));
      await session.requests.save();
      await session.requests.save();
      expect(session.state().phase).toBe('failed');
      expect(session.state().selection).toEqual(selected);
      expect(writeMock).toHaveBeenCalledTimes(1);
      expect(readMock).not.toHaveBeenCalled();
    }
  );
  it.each([500, 502, undefined])(
    'treats %s write failure as unconfirmed until an explicit fresh read',
    async (status) => {
      const session = setup();
      writeMock.mockResolvedValue(
        status ? failed(status) : { error: new TypeError('Network failed') }
      );
      await session.requests.save();
      expect(session.state()).toMatchObject({ failure: 'unconfirmed', saved: false });
      const fresh = grant({ revision: 7, policyToken: 'b'.repeat(64), effective: [], stored: [] });
      readMock.mockResolvedValue({ data: fresh });
      await session.requests.read();
      expect(session.state()).toMatchObject({
        grant: fresh,
        selection: [],
        failure: null,
        saved: false,
      });
      expect(writeMock).toHaveBeenCalledTimes(1);
    }
  );
  it('ignores a read that arrives after dismissal or a new session', async () => {
    const session = setup();
    let complete: ((value: { data: ReturnType<typeof grant> }) => void) | undefined;
    readMock.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const read = session.requests.read();
    session.sequence.current += 1;
    session.update({ ...session.state(), open: false });
    complete?.({ data: grant() });
    await read;
    expect(session.state().grant).toBeNull();
    expect(session.state().open).toBe(false);
  });
  it('does not invent a grant after read failure', async () => {
    const session = setup();
    readMock.mockResolvedValue(failed(409));
    await session.requests.read();
    expect(session.state()).toMatchObject({
      phase: 'failed',
      grant: null,
      selection: [],
      failure: 'conflict',
    });
    expect(writeMock).not.toHaveBeenCalled();
  });
});
