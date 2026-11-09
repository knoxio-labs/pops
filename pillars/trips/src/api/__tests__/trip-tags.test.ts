import { describe, expect, it } from 'vitest';

import { fetchSharedTagIds } from '../rest/trip-tags.js';

const id = 'ac8bc979-9995-4f78-a0dc-b8fa34c74fc9';
describe('Tags-owned identity snapshot', () => {
  it('projects published IDs including retained archived/merged sources without taking vocabulary ownership', async () => {
    expect(
      await fetchSharedTagIds(async () => ({
        kind: 'ok',
        value: {
          tags: [
            {
              id,
              name: 'Source label',
              facet: 'hobby',
              archived: true,
              mergedIntoId: 'fe8a1d81-df61-44f0-bdf8-f7020bc30bd4',
            },
          ],
        },
      }))
    ).toEqual([id]);
  });
  it.each([{ tags: [{ id: 'invalid' }] }, { tags: null }, {}, { tags: [{ id }, {}] }])(
    'rejects an incomplete/malformed identity snapshot %j',
    async (value) => {
      expect(await fetchSharedTagIds(async () => ({ kind: 'ok', value }))).toBeUndefined();
    }
  );
  it('distinguishes a real empty snapshot from an outage or thrown request', async () => {
    expect(await fetchSharedTagIds(async () => ({ kind: 'ok', value: { tags: [] } }))).toEqual([]);
    expect(
      await fetchSharedTagIds(async () => ({ kind: 'unavailable', pillar: 'tags' }))
    ).toBeUndefined();
    expect(
      await fetchSharedTagIds(async () => {
        throw new Error('transport failed');
      })
    ).toBeUndefined();
  });
});
