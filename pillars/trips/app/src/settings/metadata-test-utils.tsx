import { once } from 'node:events';
import { createServer } from 'node:http';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { tripMetadataReadSchema } from '@pops/trips-workspace';

import { createClient } from '../trips-api/client';
import { useTripEditor } from './use-trip-editor';

import type { RequestListener, ServerResponse } from 'node:http';

import type { ReactNode } from 'react';

import type { Trip } from '../api/types';

/** Fictional canonical metadata keeps opaque planning text independent of route dates. */
export const metadataTrip: Trip = {
  id: 7,
  name: 'Original',
  destination: '  Québec  ',
  when: '  after winter, perhaps  ',
  notes: 'Notes',
  parentId: null,
  tagId: null,
  sourceLinks: [{ uri: 'https://example.test/original' }],
  createdAt: '2026-11-10T00:00:00Z',
  updatedAt: '2026-11-10T00:00:00Z',
};

/** A real owner HTTP server can commit a PATCH and then lose its response. */
export async function metadataServer() {
  const sources = { a: structuredClone(metadataTrip), b: { ...metadataTrip, name: 'Owner B' } };
  const requests: { method: string; path: string; body: string }[] = [];
  const control: MetadataControl = { loseNext: false, releases: [] };
  const server = createServer(metadataListener(sources, requests, control)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  const origin = `http://127.0.0.1:${address.port}`;
  const client = createClient({ baseUrl: `${origin}/a` });
  return {
    client,
    origin,
    requests,
    current: (scope: 'a' | 'b' = 'a'): Trip => structuredClone(sources[scope]),
    lose: (): void => {
      control.loseNext = true;
    },
    reply: (value: unknown): void => {
      control.reply = { value };
    },
    status: (status: number): void => {
      control.status = status;
    },
    hold: (): (() => void) => holdResponse(control, 'gate'),
    holdRead: (): (() => void) => holdResponse(control, 'readGate'),
    close: async (): Promise<void> => {
      for (const release of control.releases) release();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

/** Mount the production editor against an existing host cache and actual generated transport. */
export function mountMetadata(
  server: Awaited<ReturnType<typeof metadataServer>>,
  cache = new QueryClient(),
  initial = metadataTrip
) {
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(() => useTripEditor(initial, { tripClient: server.client }), { wrapper }),
    cache,
  };
}

interface MetadataControl {
  loseNext: boolean;
  status?: number;
  reply?: { value: unknown };
  gate?: Promise<void>;
  readGate?: Promise<void>;
  releases: (() => void)[];
}
function holdResponse(control: MetadataControl, key: 'gate' | 'readGate'): () => void {
  let release = (): void => {};
  control[key] = new Promise<void>((resolve) => {
    release = resolve;
  });
  control.releases.push(release);
  return release;
}
function metadataListener(
  sources: { a: Trip; b: Trip },
  requests: { method: string; path: string; body: string }[],
  control: MetadataControl
): RequestListener {
  return (request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      void (async () => {
        const path = request.url ?? '';
        const scope = path.startsWith('/b/') ? 'b' : 'a';
        requests.push({ method: request.method ?? '', path, body });
        response.setHeader('content-type', 'application/json');
        response.statusCode = control.status ?? 200;
        control.status = undefined;
        if (request.method === 'PATCH') {
          await respondPatch({ sources, scope }, body, control, response);
        } else {
          const source = structuredClone(control.reply ? control.reply.value : sources[scope]);
          control.reply = undefined;
          if (control.readGate) {
            const pending = control.readGate;
            control.readGate = undefined;
            await pending;
          }
          response.end(JSON.stringify(path.endsWith('/trips') ? { trips: [source] } : source));
        }
      })().catch(() => {
        response.writeHead(500);
        response.end('{}');
      });
    });
  };
}

async function respondPatch(
  { sources, scope }: { sources: { a: Trip; b: Trip }; scope: 'a' | 'b' },
  body: string,
  control: MetadataControl,
  response: ServerResponse
): Promise<void> {
  const patch: unknown = JSON.parse(body);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new Error('Invalid fixture PATCH');
  sources[scope] = tripMetadataReadSchema.parse({ ...sources[scope], ...patch });
  if (control.gate) {
    const pending = control.gate;
    control.gate = undefined;
    await pending;
  }
  if (control.loseNext) {
    control.loseNext = false;
    response.destroy();
    return;
  }
  const value = control.reply ? control.reply.value : sources[scope];
  control.reply = undefined;
  response.end(JSON.stringify(value));
}
