import { expect, it } from 'vitest';

import { createClient } from '../trips-api/client';
import { applyDecisionCommand } from './api';
import { sourceDecision } from './test-utils';

it('deletes and atomically restores the same selected identity without rewriting arrangements', async () => {
  const initial = sourceDecision(4);
  initial.decision.selectedOptionId = 9;
  const requests: { method: string; path: string; body: unknown }[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: await request.json(),
    });
    return request.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(initial.options[0]), {
          headers: { 'content-type': 'application/json' },
        });
  };
  const props = {
    tripId: 7,
    decisionId: 8,
    client: createClient({ baseUrl: 'https://decision.test', fetch: fetcher }),
  };
  const deleted = await applyDecisionCommand(props, initial, { kind: 'remove-option', id: 9 });
  expect(deleted.source).toMatchObject({
    decision: { selectedOptionId: null, revision: 5 },
    options: [],
  });
  expect(deleted.inverse).toEqual({ kind: 'restore-option', id: 9, select: true });
  if (!deleted.inverse) throw new Error('Missing inverse');
  const restored = await applyDecisionCommand(props, deleted.source, deleted.inverse);
  expect(restored.source).toMatchObject({
    decision: { selectedOptionId: 9, revision: 6 },
    options: [{ id: 9, affectedSources: [{ kind: 'journey', id: 24 }] }],
  });
  expect(requests).toEqual([
    { method: 'DELETE', path: '/trips/7/decisions/8/options/9', body: { expectedRevision: 4 } },
    {
      method: 'POST',
      path: '/trips/7/decisions/8/options/9/restore',
      body: { select: true, expectedRevision: 5 },
    },
  ]);
});
it('treats an unsuccessful deletion and an absent response as failures, producing no inverse', async () => {
  for (const fetcher of [
    async () =>
      new Response(
        JSON.stringify({
          code: 'trips.decision.decision_revision_conflict',
          message: 'Revision changed',
          retryable: false,
          requestId: 'revision-test',
        }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      ),
    async () => {
      throw new Error('connection lost');
    },
  ]) {
    const props = {
      tripId: 7,
      decisionId: 8,
      client: createClient({ baseUrl: 'https://decision.test', fetch: fetcher }),
    };
    await expect(
      applyDecisionCommand(props, sourceDecision(), { kind: 'remove-option', id: 9 })
    ).rejects.toThrow();
  }
});
it('omits untouched option fields and retains exact historical source identity in replacement inverses', async () => {
  const source = sourceDecision(2);
  const requestBodies: unknown[] = [];
  const option = source.options[0];
  if (!option) throw new Error('Missing option fixture');
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    requestBodies.push(await new Request(input, init).json());
    return new Response(JSON.stringify({ ...option, affectedSources: [] }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const props = {
    tripId: 7,
    decisionId: 8,
    client: createClient({ baseUrl: 'https://decision.test', fetch: fetcher }),
  };
  const result = await applyDecisionCommand(props, source, {
    kind: 'edit-option',
    id: 9,
    fields: { affectedSources: [] },
  });
  expect(requestBodies).toEqual([{ expectedRevision: 2, affectedSources: [] }]);
  expect(JSON.parse(JSON.stringify(result.inverse))).toEqual({
    kind: 'edit-option',
    id: 9,
    fields: { affectedSources: [{ kind: 'journey', id: 24 }] },
  });
});
it('selects and reopens only the decision while preserving competing source options', async () => {
  const initial = sourceDecision();
  const bodies: unknown[] = [];
  const paths: string[] = [];
  let revision = 0;
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const body: unknown = await request.json();
    bodies.push(body);
    paths.push(`${request.method} ${new URL(request.url).pathname}`);
    if (typeof body !== 'object' || body === null || !('optionId' in body))
      throw new Error('Invalid selection body');
    return new Response(
      JSON.stringify({
        ...initial.decision,
        selectedOptionId: body.optionId,
        revision: ++revision,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  };
  const props = {
    tripId: 7,
    decisionId: 8,
    client: createClient({ baseUrl: 'https://decision.test', fetch: fetcher }),
  };
  const selected = await applyDecisionCommand(props, initial, {
    kind: 'select-option',
    optionId: 9,
  });
  const reopened = await applyDecisionCommand(props, selected.source, {
    kind: 'select-option',
    optionId: null,
  });
  expect(reopened.source.options).toEqual(initial.options);
  expect(bodies).toEqual([
    { optionId: 9, expectedRevision: 0 },
    { optionId: null, expectedRevision: 1 },
  ]);
  expect(paths).toEqual([
    'PUT /trips/7/decisions/8/selection',
    'PUT /trips/7/decisions/8/selection',
  ]);
});
