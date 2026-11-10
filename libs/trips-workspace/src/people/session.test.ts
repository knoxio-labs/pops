import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { peopleSession } from './session';
import { meetingPlan, meetingResult } from './test-utils';

import type { MeetingOperation } from './types';

afterEach(() => vi.restoreAllMocks());

function transport() {
  const requests: Request[] = [];
  let failing = false;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const operation: MeetingOperation = await request.json();
    return new Response(
      JSON.stringify(
        failing
          ? { code: 'offline', message: 'Unavailable', retryable: true }
          : meetingResult(operation, null, meetingPlan())
      ),
      { status: failing ? 503 : 200, headers: { 'content-type': 'application/json' } }
    );
  });
  const origin = `http://people-${crypto.randomUUID()}.test`;
  return {
    client: createClient({ baseUrl: origin, fetch: fetcher }),
    origin,
    requests,
    fail: (value: boolean) => {
      failing = value;
    },
    fetcher,
  };
}

describe('retained meeting semantic owner', () => {
  it('fences an uncertain create after mutable origin change and retries the exact operation only after restoration', async () => {
    const api = transport();
    const editor = peopleSession({ tripId: 7, client: api.client }, []);
    api.fail(true);
    await editor.run({
      kind: 'create',
      input: { contactUri: 'pops:contacts/contact/issued', title: 'Retained draft' },
    });
    const operation = editor.snapshot().failure?.operation;
    expect(operation).toBeDefined();
    api.client.setConfig({ baseUrl: 'http://other-owner.test' });
    await editor.retry();
    expect(api.requests).toHaveLength(1);
    expect(editor.snapshot().failure?.operation).toBe(operation);
    editor.reload([]);
    expect(editor.snapshot().failure?.operation).toBe(operation);
    api.client.setConfig({ baseUrl: api.origin });
    expect(peopleSession({ tripId: 7, client: api.client }, [])).toBe(editor);
    api.fail(false);
    await editor.retry();
    expect(api.requests).toHaveLength(2);
    expect(api.requests.map((request) => new URL(request.url).origin)).toEqual([
      api.origin,
      api.origin,
    ]);
    expect(await api.requests[1]?.json()).toEqual(operation);
    expect(editor.snapshot().failure).toBeNull();
  });

  it.each(['write', 'undo'] as const)(
    'fences %s at point of use and retains its exact command',
    async (kind) => {
      const api = transport();
      const editor = peopleSession({ tripId: 7, client: api.client }, []);
      await editor.run({
        kind: 'create',
        input: { contactUri: 'pops:contacts/contact/issued', title: 'Confirmed' },
      });
      expect(editor.snapshot().canUndo).toBe(true);
      api.client.setConfig({ baseUrl: 'http://other-owner.test' });
      if (kind === 'undo') await editor.undo();
      else
        await editor.run({
          kind: 'update',
          id: 41,
          expectedRevision: 1,
          patch: { title: 'Draft' },
        });
      expect(api.requests).toHaveLength(1);
      const operation = editor.snapshot().failure?.operation;
      expect(operation?.command.kind).toBe(kind === 'undo' ? 'undo' : 'update');
      api.client.setConfig({ baseUrl: api.origin });
      await editor.retry();
      expect(await api.requests[1]?.json()).toEqual(operation);
      expect(editor.snapshot().failure).toBeNull();
    }
  );

  it('captures and fences the actual default generated transport', async () => {
    const original = defaultClient.getConfig();
    const api = transport();
    try {
      defaultClient.setConfig({ baseUrl: api.origin, fetch: api.fetcher });
      const editor = peopleSession({ tripId: 8 }, []);
      defaultClient.setConfig({ baseUrl: 'http://other-default-owner.test' });
      await editor.run({
        kind: 'create',
        input: { contactUri: 'pops:contacts/contact/issued', title: 'Default owner' },
      });
      expect(api.requests).toHaveLength(0);
      defaultClient.setConfig({ baseUrl: api.origin });
      await editor.retry();
      expect(api.requests).toHaveLength(1);
    } finally {
      defaultClient.setConfig(original);
    }
  });
});
