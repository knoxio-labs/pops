import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { RouteOperationSchema } from '../route-schemas.js';

it('requires explicit placement anchors, exact safe revisions, canonical source kind and UUID identity', () => {
  const input = {
    operationId: randomUUID(),
    expectedRevision: 0,
    command: { kind: 'gap.create', before: null },
  };
  expect(RouteOperationSchema.parse(input)).toEqual(input);
  for (const expectedRevision of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(RouteOperationSchema.safeParse({ ...input, expectedRevision }).success).toBe(false);
  for (const command of [
    { kind: 'gap.create' },
    {
      kind: 'source.move',
      source: { kind: 'place', id: 1 },
      destination: { kind: 'route', before: null },
    },
    {
      kind: 'source.move',
      source: { kind: 'visit', id: 0 },
      destination: { kind: 'route', before: null },
    },
    { kind: 'source.move', source: { kind: 'visit', id: 1 }, destination: { kind: 'route' } },
    { kind: 'path.apply', pathId: 1, dates: { arrival: '2028-01-01' } },
    {
      kind: 'path.create',
      title: 'Nested Visit',
      gapId: 1,
      members: [{ kind: 'visit', id: 1, parentId: 2 }],
    },
  ])
    expect(RouteOperationSchema.safeParse({ ...input, command }).success).toBe(false);
  expect(RouteOperationSchema.safeParse({ ...input, operationId: 'source-label' }).success).toBe(
    false
  );
});
