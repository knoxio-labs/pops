/**
 * A pillar reached through the real server SDK, for the one property a fake
 * handle cannot show: the request bfm's call actually becomes.
 *
 * `fakePillarHandle` hands a client's input straight to the test, so it
 * accepts any argument shape, including ones the SDK cannot send. Here the
 * input goes through `pillar()`'s route map and request builder, and the test
 * sees the method, URL and JSON body the producer would receive.
 */
import { pillar } from '@pops/pillar-sdk/server';

import type { DiscoveredPillar, DiscoveryTransport } from '@pops/pillar-sdk/client';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import type { PillarHandleFactory } from '../pillars/gateway.js';

const BASE_URL = 'http://producer.internal.test';

/** One producer route, declared as its OpenAPI document declares it. */
export interface WireOperation {
  readonly operationId: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** OpenAPI path template, e.g. `/ego/action-batches/{batchId}/decide`. */
  readonly path: string;
  readonly query?: readonly string[];
  readonly hasBody?: boolean;
}

export interface WireRequest {
  readonly method: string;
  /** Path and query, without the base URL. */
  readonly url: string;
  readonly body: unknown;
}

export interface WireAnswer {
  readonly status: number;
  readonly body: unknown;
}

function openApiDocument(operations: readonly WireOperation[]): unknown {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const parameters = [
      ...[...operation.path.matchAll(/\{(\w+)\}/gu)].map(([, name]) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      })),
      ...(operation.query ?? []).map((name) => ({ name, in: 'query', schema: { type: 'string' } })),
    ];
    paths[operation.path] = {
      ...paths[operation.path],
      [operation.method]: {
        operationId: operation.operationId,
        parameters,
        ...(operation.hasBody === true
          ? { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } }
          : {}),
      },
    };
  }
  return { openapi: '3.0.0', info: { title: 'producer', version: '1' }, paths };
}

function manifest(pillarId: string): ManifestPayload {
  return {
    pillar: pillarId,
    version: '0.0.1-test',
    contract: { package: '@pops/core-contract', version: '0.0.1-test', tag: 'test' },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

function discovered(pillarId: string): DiscoveredPillar {
  return {
    pillarId,
    baseUrl: BASE_URL,
    status: 'healthy',
    manifest: manifest(pillarId),
    lastSeenAt: '2026-11-05T00:00:00.000Z',
    registered: true,
  };
}

function readBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') return undefined;
  return JSON.parse(init.body) as unknown;
}

/**
 * A handle factory whose every pillar is served by `operations` and answered
 * by `answer`. Requires a server-SDK API key to be configured, as `pillar()`
 * itself does.
 */
export function sdkWireFactory(
  pillarId: string,
  operations: readonly WireOperation[],
  answer: (request: WireRequest) => WireAnswer
): { factory: PillarHandleFactory; requests: WireRequest[] } {
  const requests: WireRequest[] = [];
  const document = openApiDocument(operations);
  const transport: DiscoveryTransport = {
    fetchSnapshot: () => Promise.resolve([discovered(pillarId)]),
  };
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/openapi') {
      return Promise.resolve(Response.json(document));
    }
    const request: WireRequest = {
      method: init?.method ?? 'GET',
      url: `${url.pathname}${url.search}`,
      body: readBody(init),
    };
    requests.push(request);
    const reply = answer(request);
    return Promise.resolve(Response.json(reply.body, { status: reply.status }));
  };
  const factory: PillarHandleFactory = <TRouter>(id: string) =>
    pillar<TRouter>(id, { transport, fetchImpl });
  return { factory, requests };
}
