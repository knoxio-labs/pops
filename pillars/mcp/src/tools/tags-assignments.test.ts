import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, extractText } from './test-helpers.js';

const { getPillarMock, financeAttach, financeDetach, purchasesAttach, purchasesDetach } =
  vi.hoisted(() => {
    const finance = { attach: vi.fn(), detach: vi.fn() };
    const purchases = { attach: vi.fn(), detach: vi.fn() };
    return {
      getPillarMock: vi.fn((pillar: string) => ({
        tagged: pillar === 'finance' ? finance : purchases,
      })),
      financeAttach: finance.attach,
      financeDetach: finance.detach,
      purchasesAttach: purchases.attach,
      purchasesDetach: purchases.detach,
    };
  });

vi.mock('../pillar-client.js', () => ({
  getPillar: getPillarMock,
}));

const { tagsAssignmentTools } = await import('./tags-assignments.js');

function tool(name: string) {
  const found = tagsAssignmentTools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no such tool: ${name}`);
  return found;
}

function inputFor(pillar: 'finance' | 'purchases') {
  return {
    pillar,
    entityType: pillar === 'finance' ? 'transaction' : 'purchase-item',
    entityId: 'entity-1',
    tagId: 'tag-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [financeAttach, financeDetach, purchasesAttach, purchasesDetach]) {
    method.mockResolvedValue(callOk({ attached: true }));
  }
});

describe('shared tag assignment tools', () => {
  it.each([
    { operation: 'attach', pillar: 'finance', method: financeAttach },
    { operation: 'detach', pillar: 'finance', method: financeDetach },
    { operation: 'attach', pillar: 'purchases', method: purchasesAttach },
    { operation: 'detach', pillar: 'purchases', method: purchasesDetach },
  ] as const)('dispatches $operation to $pillar', async ({ operation, pillar, method }) => {
    const input = inputFor(pillar);

    const result = await tool(`tags.assignments.${operation}`).handler(input);

    expect(getPillarMock).toHaveBeenCalledExactlyOnceWith(pillar);
    expect(method).toHaveBeenCalledExactlyOnceWith({
      entityType: input.entityType,
      entityId: input.entityId,
      tagId: input.tagId,
    });
    expect(result.isError).toBeUndefined();
  });

  it('declares the selected carrier scope template', () => {
    expect(tool('tags.assignments.attach').scope).toBe('<pillar>.tagged');
    expect(tool('tags.assignments.detach').scope).toBe('<pillar>.tagged');
  });

  it('rejects an unlisted pillar without calling a carrier', async () => {
    const result = await tool('tags.assignments.attach').handler({
      ...inputFor('finance'),
      pillar: 'inventory',
    });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('pillar must be finance or purchases');
    expect(getPillarMock).not.toHaveBeenCalled();
  });

  it('rejects an entity type that does not belong to the selected pillar', async () => {
    const result = await tool('tags.assignments.attach').handler({
      ...inputFor('finance'),
      entityType: 'purchase-item',
    });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("entityType must be 'transaction'");
    expect(getPillarMock).not.toHaveBeenCalled();
  });

  it.each([
    { pillar: 'finance' as const, method: financeAttach },
    { pillar: 'purchases' as const, method: purchasesAttach },
  ])(
    'names the $pillar scope when the carrier refuses authorization',
    async ({ pillar, method }) => {
      method.mockResolvedValueOnce({
        kind: 'unauthorized',
        pillar,
        message: 'The caller is not authorized.',
      });

      const result = await tool('tags.assignments.attach').handler(inputFor(pillar));
      const message = extractText(result);

      expect(result.isError).toBe(true);
      expect(message).toContain(`service-account scope '${pillar}.tagged'`);
      expect(message).not.toContain('presents to inventory');
    }
  );

  it('maps a missing carrier entity to a readable tool error', async () => {
    purchasesDetach.mockResolvedValueOnce({
      kind: 'not-found',
      pillar: 'purchases',
      message: 'Purchase item not found.',
    });

    const result = await tool('tags.assignments.detach').handler(inputFor('purchases'));

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('Purchase item not found.');
  });
});
