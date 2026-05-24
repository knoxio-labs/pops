import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractText, mockClient, parseResult } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

beforeEach(() => vi.clearAllMocks());

const { cerebrumTools } = await import('./cerebrum.js');

describe('cerebrum.engrams.list', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.engrams.list')!;

  it('passes scope and tag arrays correctly', async () => {
    await tool.handler({ scopes: ['work', 'personal'], tags: ['important'] });
    expect(mockClient.cerebrum.engrams.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ['work', 'personal'], tags: ['important'] })
    );
  });

  it('filters non-string elements from scope and tag arrays', async () => {
    await tool.handler({ scopes: ['valid', 42, null, 'also-valid'] });
    const call = mockClient.cerebrum.engrams.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['scopes']).toEqual(['valid', 'also-valid']);
  });

  it('ignores invalid status values', async () => {
    await tool.handler({ status: 'deleted' });
    const call = mockClient.cerebrum.engrams.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['status']).toBeUndefined();
  });
});

describe('cerebrum.engrams.get', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.engrams.get')!;

  it('calls engrams.get.query with the id', async () => {
    const result = await tool.handler({ id: 'eng_1' });
    expect(mockClient.cerebrum.engrams.get.query).toHaveBeenCalledWith({ id: 'eng_1' });
    expect(result.isError).toBeUndefined();
    const text = extractText(result);
    expect(text).toContain('eng_1');
  });

  it('returns isError for missing id', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError for empty id', async () => {
    const result = await tool.handler({ id: '' });
    expect(result.isError).toBe(true);
  });
});

describe('cerebrum.search', () => {
  const tool = cerebrumTools.find((t) => t.name === 'cerebrum.search')!;

  it('calls retrieval.search.query with query and defaults to hybrid', async () => {
    await tool.handler({ query: 'home automation' });
    expect(mockClient.cerebrum.retrieval.search.query).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'home automation', mode: 'hybrid' })
    );
  });

  it('passes explicit mode', async () => {
    await tool.handler({ query: 'test', mode: 'semantic' });
    expect(mockClient.cerebrum.retrieval.search.query).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'semantic' })
    );
  });

  it('returns isError for missing query', async () => {
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError for blank query', async () => {
    const result = await tool.handler({ query: '   ' });
    expect(result.isError).toBe(true);
  });
});

describe('cerebrum tools registry', () => {
  it('result text is valid JSON', async () => {
    const tool = cerebrumTools.find((t) => t.name === 'cerebrum.search')!;
    const result = await tool.handler({ query: 'test' });
    const text = extractText(result);
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = parseResult(result) as { results: unknown[] };
    expect(parsed.results).toEqual([]);
  });
});
