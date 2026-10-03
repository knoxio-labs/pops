import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPillar } from '../pillar-client.js';
import { callOk, callUnavailable, extractText } from './test-helpers.js';

const { getPillarMock, operations } = vi.hoisted(() => {
  const operations = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    merge: vi.fn(),
  };
  const handle = { tags: operations };
  return { getPillarMock: vi.fn(() => handle), operations };
});

vi.mock('../pillar-client.js', () => ({
  getPillar: getPillarMock,
  __resetPillarClientForTests: () => {},
}));

const { tagsTools } = await import('./tags.js');

function tool(name: string) {
  const found = tagsTools.find((candidate) => candidate.name === name);
  if (!found) throw new Error('no such tool: ' + name);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  operations.list.mockResolvedValue(callOk({ tags: [] }));
  operations.get.mockResolvedValue(callOk(null));
  operations.create.mockResolvedValue(callOk(null));
  operations.update.mockResolvedValue(callOk(null));
  operations.archive.mockResolvedValue(callOk(null));
  operations.merge.mockResolvedValue(callOk(null));
});

describe('the shared tag tools', () => {
  it('declare the tags vocabulary scope and make one tags-pillar call per handler', async () => {
    const requests: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ['tags.tags.list', {}],
      ['tags.tags.get', { id: 'tag_1' }],
      ['tags.tags.create', { facet: 'trip', name: 'Japan trip' }],
      ['tags.tags.update', { id: 'tag_1' }],
      ['tags.tags.archive', { id: 'tag_1' }],
      ['tags.tags.merge', { id: 'tag_1', intoId: 'tag_2' }],
    ];

    for (const [name, args] of requests) {
      expect(tool(name).scope).toBe('tags.tags');
      await tool(name).handler(args);
      expect(getPillar).toHaveBeenCalledWith('tags');
      expect(getPillar).toHaveBeenCalledTimes(1);
      vi.mocked(getPillar).mockClear();
    }
  });

  it('does not call the pillar when create is missing its facet or name', async () => {
    const missingFacet = await tool('tags.tags.create').handler({ name: 'Japan trip' });
    expect(missingFacet.isError).toBe(true);
    expect(extractText(missingFacet)).toContain('facet');

    const missingName = await tool('tags.tags.create').handler({ facet: 'trip' });
    expect(missingName.isError).toBe(true);
    expect(extractText(missingName)).toContain('name');

    expect(operations.create).not.toHaveBeenCalled();
    expect(getPillar).not.toHaveBeenCalled();
  });

  it.each([
    {
      toolName: 'tags.tags.list',
      args: { facet: 'book' },
      message: 'Invalid field: facet must be trip, hobby, or project.',
    },
    {
      toolName: 'tags.tags.list',
      args: { facet: 1 },
      message: 'Invalid field: facet must be a string.',
    },
    {
      toolName: 'tags.tags.create',
      args: { facet: 'book', name: 'Library' },
      message: 'Invalid field: facet must be trip, hobby, or project.',
    },
    {
      toolName: 'tags.tags.list',
      args: { includeArchived: true },
      message: 'Invalid field: includeArchived must be a string.',
    },
    {
      toolName: 'tags.tags.list',
      args: { includeArchived: 'sometimes' },
      message: 'Invalid field: includeArchived must be true or false.',
    },
    {
      toolName: 'tags.tags.list',
      args: { updatedSince: 1 },
      message: 'Invalid field: updatedSince must be a string.',
    },
    {
      toolName: 'tags.tags.create',
      args: { facet: 'trip', name: 'Japan trip', parentId: 1 },
      message: 'Invalid field: parentId must be a string or null.',
    },
    {
      toolName: 'tags.tags.create',
      args: { facet: 'trip', name: 'Japan trip', description: false },
      message: 'Invalid field: description must be a string or null.',
    },
    {
      toolName: 'tags.tags.create',
      args: { facet: 'trip', name: 'Japan trip', window: 'soon' },
      message: 'Invalid field: window must be an object or null.',
    },
    {
      toolName: 'tags.tags.create',
      args: {
        facet: 'trip',
        name: 'Japan trip',
        window: { start: '2026-10-01', end: 1, region: null },
      },
      message: 'Invalid field: window must be an object or null.',
    },
    {
      toolName: 'tags.tags.update',
      args: { id: 'tag_1', name: '   ' },
      message: 'Invalid field: name must be non-empty.',
    },
    {
      toolName: 'tags.tags.update',
      args: { id: 'tag_1', name: 1 },
      message: 'Invalid field: name must be non-empty.',
    },
    {
      toolName: 'tags.tags.update',
      args: { id: 'tag_1', parentId: 1 },
      message: 'Invalid field: parentId must be a string or null.',
    },
    {
      toolName: 'tags.tags.update',
      args: { id: 'tag_1', description: false },
      message: 'Invalid field: description must be a string or null.',
    },
    {
      toolName: 'tags.tags.update',
      args: { id: 'tag_1', window: 'soon' },
      message: 'Invalid field: window must be an object or null.',
    },
    {
      toolName: 'tags.tags.update',
      args: {
        id: 'tag_1',
        window: { start: null, end: '2026-10-03', region: 1 },
      },
      message: 'Invalid field: window must be an object or null.',
    },
  ])(
    'rejects invalid input for $toolName before calling the pillar',
    async ({ toolName, args, message }) => {
      const result = await tool(toolName).handler(args);

      expect(result.isError).toBe(true);
      expect(extractText(result)).toContain(message);
      expect(getPillar).not.toHaveBeenCalled();
    }
  );

  it('forwards the list filters as flat query fields', async () => {
    await tool('tags.tags.list').handler({
      facet: 'trip',
      includeArchived: 'true',
      updatedSince: '2026-10-01T00:00:00Z',
    });

    expect(operations.list).toHaveBeenCalledWith({
      facet: 'trip',
      includeArchived: 'true',
      updatedSince: '2026-10-01T00:00:00Z',
    });
  });

  it('forwards get by id', async () => {
    await tool('tags.tags.get').handler({ id: 'tag_1' });
    expect(operations.get).toHaveBeenCalledWith({ id: 'tag_1' });
  });

  it('forwards create fields without a body wrapper', async () => {
    const window = { start: '2026-10-01', end: null, region: 'Japan' };
    await tool('tags.tags.create').handler({
      facet: 'trip',
      name: 'Japan trip',
      parentId: null,
      description: 'Autumn travel',
      window,
    });

    expect(operations.create).toHaveBeenCalledWith({
      facet: 'trip',
      name: 'Japan trip',
      parentId: null,
      description: 'Autumn travel',
      window,
    });
  });

  it('forwards update with only the keys present', async () => {
    await tool('tags.tags.update').handler({ id: 'tag_1', description: null });

    expect(operations.update).toHaveBeenCalledWith({ id: 'tag_1', description: null });
  });

  it('forwards archive by id', async () => {
    await tool('tags.tags.archive').handler({ id: 'tag_1' });
    expect(operations.archive).toHaveBeenCalledWith({ id: 'tag_1' });
  });

  it('forwards merge as flat id and intoId fields', async () => {
    await tool('tags.tags.merge').handler({ id: 'tag_1', intoId: 'tag_2' });
    expect(operations.merge).toHaveBeenCalledWith({ id: 'tag_1', intoId: 'tag_2' });
  });

  it('maps unavailable and conflict responses to readable tool errors', async () => {
    operations.get.mockResolvedValueOnce(callUnavailable('tags'));
    const unavailable = await tool('tags.tags.get').handler({ id: 'tag_1' });
    expect(unavailable.isError).toBe(true);
    expect(extractText(unavailable)).toContain("Pillar 'tags' is unavailable");

    operations.update.mockResolvedValueOnce({
      kind: 'conflict',
      pillar: 'tags',
      message: 'A tag with this name already exists.',
    });
    const conflict = await tool('tags.tags.update').handler({ id: 'tag_1', name: 'Japan trip' });
    expect(conflict.isError).toBe(true);
    expect(extractText(conflict)).toContain('A tag with this name already exists.');
  });
});
