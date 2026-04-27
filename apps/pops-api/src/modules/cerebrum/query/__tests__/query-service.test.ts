import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RetrievalResult } from '../../retrieval/types.js';

// --- Mocks must be defined before imports that use them ---

vi.mock('../../../../db.js', () => ({
  getDrizzle: vi.fn(() => ({})),
}));

vi.mock('../../../../env.js', () => ({
  getEnv: vi.fn(() => 'test-api-key'),
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../lib/inference-middleware.js', () => ({
  trackInference: vi.fn((_params: Record<string, unknown>, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../../../lib/ai-retry.js', () => ({
  withRateLimitRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const mockHybrid = vi.fn();

vi.mock('../../retrieval/hybrid-search.js', () => {
  return {
    HybridSearchService: class {
      hybrid = mockHybrid;
    },
  };
});

const mockAssemble = vi.fn();

vi.mock('../../retrieval/context-assembly.js', () => {
  return {
    ContextAssemblyService: class {
      assemble = mockAssemble;
    },
  };
});

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = { create: mockCreate };
    },
  };
});

// Now import the module under test.
import { QueryService } from '../query-service.js';

function makeRetrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    sourceType: overrides.sourceType ?? 'engram',
    sourceId: overrides.sourceId ?? 'eng_20260417_0942_agent-coordination',
    title: overrides.title ?? 'Agent Coordination Notes',
    contentPreview:
      overrides.contentPreview ?? 'Notes about coordinating multiple agents in the platform.',
    score: overrides.score ?? 0.85,
    matchType: overrides.matchType ?? 'semantic',
    metadata: overrides.metadata ?? { scopes: ['work.engineering'] },
  };
}

function makeLlmResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe('QueryService', () => {
  let service: QueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new QueryService();

    // Default mocks: return some results and a basic LLM response.
    mockHybrid.mockResolvedValue([makeRetrievalResult()]);
    mockAssemble.mockReturnValue({
      context: 'Assembled context here',
      sources: [
        {
          sourceType: 'engram',
          sourceId: 'eng_20260417_0942_agent-coordination',
          title: 'Agent Coordination Notes',
          relevanceScore: 0.85,
        },
      ],
      truncated: false,
      tokenEstimate: 200,
    });
    mockCreate.mockResolvedValue(
      makeLlmResponse(
        'Agents coordinate via message passing [eng_20260417_0942_agent-coordination].'
      )
    );
  });

  describe('ask', () => {
    it('returns a complete QueryResponse for a valid question', async () => {
      const response = await service.ask({ question: 'How do agents coordinate?' });

      expect(response.answer).toContain('Agents coordinate');
      expect(response.sources).toHaveLength(1);
      expect(response.sources[0]!.id).toBe('eng_20260417_0942_agent-coordination');
      expect(response.scopes).toBeDefined();
      expect(response.confidence).toBeDefined();
    });

    it('returns low confidence with canned answer when zero results', async () => {
      mockHybrid.mockResolvedValue([]);

      const response = await service.ask({ question: 'Something completely unknown' });

      expect(response.answer).toBe("I don't have information about that.");
      expect(response.sources).toHaveLength(0);
      expect(response.confidence).toBe('low');
    });

    it('computes high confidence when top score > 0.8', async () => {
      mockHybrid.mockResolvedValue([makeRetrievalResult({ score: 0.9 })]);

      const response = await service.ask({ question: 'High confidence query' });

      expect(response.confidence).toBe('high');
    });

    it('computes medium confidence when top score is 0.5–0.8', async () => {
      mockHybrid.mockResolvedValue([makeRetrievalResult({ score: 0.65 })]);

      const response = await service.ask({ question: 'Medium confidence query' });

      expect(response.confidence).toBe('medium');
    });

    it('computes low confidence when top score < 0.5', async () => {
      mockHybrid.mockResolvedValue([makeRetrievalResult({ score: 0.35 })]);

      const response = await service.ask({ question: 'Low confidence query' });

      expect(response.confidence).toBe('low');
    });

    it('downgrades to low confidence when zero valid citations', async () => {
      // LLM returns text without any citations.
      mockCreate.mockResolvedValue(makeLlmResponse('A plain answer without citations.'));

      const response = await service.ask({ question: 'No citations answer' });

      expect(response.confidence).toBe('low');
    });

    it('trims whitespace from question', async () => {
      await service.ask({ question: '  How do agents coordinate?  ' });

      // Verify hybrid search received trimmed query.
      expect(mockHybrid).toHaveBeenCalledWith(
        'How do agents coordinate?',
        expect.objectContaining({}),
        10,
        0.3
      );
    });

    it('passes explicit scopes to retrieval filters', async () => {
      await service.ask({
        question: 'My question',
        scopes: ['work.engineering'],
      });

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ scopes: ['work.engineering'] }),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('passes includeSecret to retrieval filters', async () => {
      await service.ask({
        question: 'My question',
        includeSecret: true,
      });

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ includeSecret: true }),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('respects maxSources parameter', async () => {
      await service.ask({
        question: 'My question',
        maxSources: 5,
      });

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({}),
        5,
        expect.any(Number)
      );
    });
  });

  describe('ask — domain filtering', () => {
    it('maps domain names to sourceTypes in filters', async () => {
      await service.ask({
        question: 'How much did I spend?',
        domains: ['transactions'],
      });

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sourceTypes: ['transaction'] }),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('maps multiple domains correctly', async () => {
      await service.ask({
        question: 'Show everything',
        domains: ['engrams', 'media', 'inventory'],
      });

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sourceTypes: ['engram', 'media', 'inventory'] }),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('omits sourceTypes filter when no domains specified', async () => {
      await service.ask({ question: 'Everything' });

      const filters = mockHybrid.mock.calls[0]![1];
      expect(filters).not.toHaveProperty('sourceTypes');
    });
  });

  describe('ask — LLM graceful degradation', () => {
    it('returns fallback answer when ANTHROPIC_API_KEY is missing', async () => {
      const { getEnv } = await import('../../../../env.js');
      vi.mocked(getEnv).mockReturnValueOnce(undefined);

      const response = await service.ask({ question: 'Any question' });

      expect(response.answer).toContain('LLM unavailable');
    });

    it('returns fallback answer when LLM call throws', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API down'));

      const response = await service.ask({ question: 'Any question' });

      expect(response.answer).toContain('LLM error');
    });
  });

  describe('retrieve', () => {
    it('returns sources without calling the LLM', async () => {
      const result = await service.retrieve('How do agents work?');

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]!.id).toBe('eng_20260417_0942_agent-coordination');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns empty sources when no results', async () => {
      mockHybrid.mockResolvedValue([]);

      const result = await service.retrieve('Unknown topic');

      expect(result.sources).toHaveLength(0);
    });

    it('respects maxSources parameter', async () => {
      await service.retrieve('Query', undefined, undefined, 3);

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({}),
        3,
        expect.any(Number)
      );
    });
  });

  describe('explain', () => {
    it('returns scope inference and retrieval plan', () => {
      const result = service.explain('How do agents work?');

      expect(result.scopeInference).toBeDefined();
      expect(result.scopeInference.source).toBeDefined();
      expect(result.retrievalPlan).toBeDefined();
      expect(result.retrievalPlan.maxSources).toBe(10);
      expect(result.retrievalPlan.threshold).toBe(0.3);
    });

    it('detects secret mentions', () => {
      const result = service.explain('Where is my password stored?');

      expect(result.secretNotice).toBeTruthy();
      expect(result.secretNotice).toContain('sensitive data');
    });

    it('returns null secretNotice for normal questions', () => {
      const result = service.explain('What happened yesterday?');

      expect(result.secretNotice).toBeNull();
    });

    it('does not call hybrid search or LLM', () => {
      service.explain('Any question');

      expect(mockHybrid).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('secret scope exclusion', () => {
    it('does not include secret scopes by default', async () => {
      await service.ask({ question: 'work notes' });

      const filters = mockHybrid.mock.calls[0]![1];
      expect(filters).not.toHaveProperty('includeSecret');
    });

    it('includes secret scopes when explicitly requested', async () => {
      await service.ask({ question: 'work notes', includeSecret: true });

      const filters = mockHybrid.mock.calls[0]![1];
      expect(filters).toHaveProperty('includeSecret', true);
    });
  });
});
