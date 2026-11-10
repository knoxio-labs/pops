import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { performCaptureRequest } from './api';
import { findCaptureSession, retainCaptureSession } from './browser-session';
import { captureSource } from './test-utils';

import type { CaptureIdentity } from './types';

const originalDefault = defaultClient.getConfig();
afterEach(() => defaultClient.setConfig(originalDefault));

function owner() {
  const requests: { url: string; request: unknown }[] = [];
  let uncertain = false;
  const transport: typeof fetch = async (input) => {
    if (!(input instanceof Request)) throw new Error('Expected generated request');
    const request: unknown = await input.json();
    const body = z
      .object({
        operationId: z.uuid(),
        command: z.object({ targetOperationId: z.uuid().optional() }),
      })
      .parse(request);
    requests.push({ url: input.url, request });
    return uncertain
      ? Response.json({}, { status: 503 })
      : Response.json({
          receipt: {
            ...captureSource(),
            operationId: body.operationId,
            undoneOperationId: body.command.targetOperationId ?? null,
          },
          current: captureSource(),
          replayed: false,
          undone: false,
        });
  };
  const client = createClient({ baseUrl: 'http://owner-a.test', fetch: transport });
  const identity = { tripId: 1, client };
  return {
    client,
    identity,
    transport,
    requests,
    uncertain: (value: boolean) => {
      uncertain = value;
    },
  };
}

function session(identity: CaptureIdentity) {
  return retainCaptureSession(new QueryClient(), identity, captureSource(), {
    perform: (request) => performCaptureRequest(identity, request),
  });
}

it('fences an unknown capture retry against mutable origins and restores the exact original command', async () => {
  const source = owner();
  source.uncertain(true);
  const retained = session(source.identity);
  retained.editor.editDraft({ originalText: '  Preserved 東京 original  ' });
  expect(await retained.editor.capture()).toBe(false);
  const pending = retained.editor.getPendingRequest();
  source.client.setConfig({ baseUrl: 'http://owner-b.test' });
  expect(await retained.editor.retry()).toBe(false);
  expect(source.requests).toHaveLength(1);
  expect(retained.editor.getPendingRequest()).toEqual(pending);
  expect(retained.editor.getState().draft.originalText).toBe('  Preserved 東京 original  ');
  source.client.setConfig({ baseUrl: 'http://owner-a.test' });
  source.uncertain(false);
  expect(await retained.editor.retry()).toBe(true);
  expect(source.requests).toHaveLength(2);
  expect(source.requests[1]).toEqual(source.requests[0]);
});

it('fences first writes and Undo while retaining the original inverse and exact retry UUID', async () => {
  const source = owner();
  const retained = session(source.identity);
  retained.editor.editDraft({ originalText: 'Original' });
  source.client.setConfig({ baseUrl: 'http://owner-b.test' });
  expect(await retained.editor.capture()).toBe(false);
  expect(source.requests).toHaveLength(0);
  source.client.setConfig({ baseUrl: 'http://owner-a.test' });
  expect(await retained.editor.retry()).toBe(true);
  source.client.setConfig({ baseUrl: 'http://owner-b.test' });
  expect(await retained.editor.undo()).toBe(false);
  const undo = retained.editor.getPendingRequest();
  expect(undo?.command.kind).toBe('undo');
  expect(source.requests).toHaveLength(1);
  expect(retained.editor.getState().undoCount).toBe(1);
  source.client.setConfig({ baseUrl: 'http://owner-a.test' });
  expect(await retained.editor.retry()).toBe(true);
  expect(source.requests[1]?.request).toEqual({
    operationId: undo?.operationId,
    command: undo?.command,
  });
  expect(retained.editor.getState().draft.originalText).toBe('Original');
});

it('allows a replacement client at the same semantic origin to retry the original request', async () => {
  const source = owner();
  source.uncertain(true);
  const retained = session(source.identity);
  retained.editor.editDraft({ originalText: 'Same owner, replacement transport' });
  expect(await retained.editor.capture()).toBe(false);
  const replacement = createClient({ baseUrl: 'http://owner-a.test', fetch: source.transport });
  const identity = { tripId: 1, client: replacement };
  retained.bindPerformer(identity, (request) => performCaptureRequest(identity, request));
  source.uncertain(false);
  expect(await retained.editor.retry()).toBe(true);
  expect(source.requests).toHaveLength(2);
  expect(source.requests[1]).toEqual(source.requests[0]);
});

it('checks the current effective client on a mutable identity without rejecting same-origin replacement', async () => {
  const source = owner();
  const retained = session(source.identity);
  retained.editor.editDraft({ originalText: 'Retained owner A' });
  source.identity.client = createClient({
    baseUrl: 'http://owner-b.test',
    fetch: source.transport,
  });
  expect(await retained.editor.capture()).toBe(false);
  const pending = retained.editor.getPendingRequest();
  expect(source.requests).toHaveLength(0);
  source.identity.client = createClient({
    baseUrl: 'http://owner-a.test',
    fetch: source.transport,
  });
  expect(await retained.editor.retry()).toBe(true);
  expect(source.requests).toHaveLength(1);
  expect(source.requests[0]?.request).toEqual(pending);
});

it('uses the effective default origin for retention and point-use safety', async () => {
  const source = owner();
  defaultClient.setConfig({ baseUrl: 'http://owner-a.test', fetch: source.transport });
  const cache = new QueryClient();
  const identity = { tripId: 1 };
  const retained = retainCaptureSession(cache, identity, captureSource(), {
    perform: (request) => performCaptureRequest(identity, request),
  });
  retained.editor.editDraft({ originalText: 'Default owner' });
  defaultClient.setConfig({ baseUrl: 'http://owner-b.test' });
  expect(findCaptureSession(cache, identity)).toBeUndefined();
  expect(await retained.editor.capture()).toBe(false);
  expect(source.requests).toHaveLength(0);
  defaultClient.setConfig({ baseUrl: 'http://owner-a.test' });
  expect(findCaptureSession(cache, identity)).toBe(retained);
  expect(await retained.editor.retry()).toBe(true);
  expect(source.requests[0]?.url).toBe('http://owner-a.test/trips/1/captures/create');
});
