import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, callUnavailable, extractText } from './test-helpers.js';

const { getPillarMock, query } = vi.hoisted(() => {
  const query = vi.fn();
  return {
    getPillarMock: vi.fn(() => ({ tagged: { query } })),
    query,
  };
});

vi.mock('../pillar-client.js', () => ({
  getPillar: getPillarMock,
}));

const { tagsThingsTools } = await import('./tags-things.js');

function thingsList() {
  const found = tagsThingsTools.find((candidate) => candidate.name === 'tags.things.list');
  if (!found) throw new Error('no such tool: tags.things.list');
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue(callOk({ expandedTagIds: [], sections: [], pillars: [] }));
});

describe('tags.things.list', () => {
  it('forwards tag ids and limit to one orchestrator query', async () => {
    const tagIds = ['trip-1', 'project-2'];

    await thingsList().handler({ tagIds, limit: 25 });

    expect(getPillarMock).toHaveBeenCalledWith('orchestrator');
    expect(getPillarMock).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ tagIds, limit: 25 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns a tool error for an empty id list without calling the orchestrator', async () => {
    const result = await thingsList().handler({ tagIds: [] });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('tagIds');
    expect(getPillarMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns partial results as success with unavailable carrier status visible', async () => {
    query.mockResolvedValueOnce(
      callOk({
        expandedTagIds: ['trip-1'],
        sections: [],
        pillars: [
          { id: 'finance', status: 'unavailable' },
          { id: 'purchases', status: 'ok' },
        ],
      })
    );

    const result = await thingsList().handler({ tagIds: ['trip-1'] });

    expect(result.isError).toBeUndefined();
    expect(extractText(result)).toContain('"status":"unavailable"');
    expect(extractText(result)).toContain('"id":"finance"');
  });

  it('surfaces an unavailable orchestrator response as a tool error', async () => {
    query.mockResolvedValueOnce(callUnavailable('orchestrator'));

    const result = await thingsList().handler({ tagIds: ['trip-1'] });

    expect(result.isError).toBe(true);
    expect(extractText(result).toLowerCase()).toContain('unavailable');
    expect(extractText(result)).not.toContain('"sections":[]');
  });

  it('rejects an invalid limit before calling the orchestrator', async () => {
    const result = await thingsList().handler({ tagIds: ['trip-1'], limit: 0 });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('limit');
    expect(getPillarMock).not.toHaveBeenCalled();
  });
});
