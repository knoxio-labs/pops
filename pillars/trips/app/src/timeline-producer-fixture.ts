import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { z } from 'zod';

import { createClient } from './trips-api/client';

/** Run the actual owning SQLite producer with a typed identity and independent Documents fixture. */
export async function timelineProducer() {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', resolve('../src/api/__tests__/timeline-host.fixture.ts')],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const lines = createInterface({ input: child.stdout });
  const close = async () => {
    lines.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  };
  try {
    const [line] = await Promise.race([
      once(lines, 'line'),
      once(child, 'exit').then(() => {
        throw new Error('Timeline producer exited before ready');
      }),
    ]);
    const identity = z
      .object({ origin: z.url(), tripId: z.number().int().positive() })
      .parse(JSON.parse(String(line)));
    const recording = requestRecorder();
    const { documentsClient, documentsRequests } = documentsOwner();
    const { tagsClient, tagsRequests } = tagsOwner();
    return {
      tagsClient,
      tagsRequests,
      loseNextWrite: recording.loseNextWrite,
      failNextTripRead: recording.failNextTripRead,
      holdNextStayCreate: recording.holdNextStayCreate,
      tripId: identity.tripId,
      client: createClient({
        baseUrl: identity.origin,
        headers: { 'x-api-key': 'fixture' },
        fetch: recording.transport,
      }),
      documentsClient,
      requests: recording.requests,
      documentsRequests,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function documentsOwner() {
  const documentsRequests: string[] = [];
  const documentsClient = createClient({
    baseUrl: 'https://documents.fixture',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      documentsRequests.push(path);
      if (path !== '/paperless/status') throw new Error(`Unexpected Documents request: ${path}`);
      return Response.json({
        data: {
          configured: false,
          available: false,
          baseUrl: null,
          documentCount: null,
          maxUploadBytes: 1024,
          allowedMimeTypes: [],
        },
      });
    },
  });
  return { documentsClient, documentsRequests };
}

function requestRecorder() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const held = holdStayResponse();
  let loseNext = false;
  let failRead = false;
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: request.method === 'GET' ? null : await request.clone().json(),
    });
    if (
      failRead &&
      request.method === 'GET' &&
      /^\/trips\/\d+$/.test(new URL(request.url).pathname)
    ) {
      failRead = false;
      throw new TypeError('Fixture metadata read failed');
    }
    const response = await fetch(request);
    if (loseNext && request.method === 'PATCH') {
      loseNext = false;
      throw new TypeError('Fixture response lost after commit');
    }
    return held.deliver(request, response);
  };
  return {
    holdNextStayCreate: held.next,
    requests,
    transport,
    failNextTripRead: () => {
      failRead = true;
    },
    loseNextWrite: () => {
      loseNext = true;
    },
  };
}

function tagsOwner() {
  const tagsRequests: string[] = [];
  const tagsClient = createClient({
    baseUrl: 'https://tags.fixture',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      tagsRequests.push(new URL(request.url).pathname);
      if (request.method !== 'GET' || new URL(request.url).pathname !== '/tags')
        throw new Error('Unexpected Tags request');
      return Response.json({ tags: [] });
    },
  });
  return { tagsClient, tagsRequests };
}

function holdStayResponse() {
  let pending:
    | { committed: ReturnType<typeof signal>; released: ReturnType<typeof signal> }
    | undefined;
  return {
    next: () => {
      if (pending) throw new Error('A Stay response is already held');
      const committed = signal();
      const released = signal();
      pending = { committed, released };
      return { committed: committed.promise, release: released.resolve };
    },
    deliver: async (request: Request, response: Response) => {
      if (
        pending &&
        request.method === 'POST' &&
        /^\/trips\/\d+\/stays$/.test(new URL(request.url).pathname)
      ) {
        const active = pending;
        pending = undefined;
        active.committed.resolve();
        await active.released.promise;
      }
      return response;
    },
  };
}

function signal() {
  let resolve: () => void = () => {
    throw new Error('Signal was not initialized');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
