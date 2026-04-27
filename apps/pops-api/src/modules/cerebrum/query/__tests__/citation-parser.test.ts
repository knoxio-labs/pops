import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CitationParser } from '../citation-parser.js';

import type { RetrievalResult } from '../../retrieval/types.js';

// Suppress logger.warn in tests.
vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    sourceType: overrides.sourceType ?? 'engram',
    sourceId: overrides.sourceId ?? 'eng_20260417_0942_agent-coordination',
    title: overrides.title ?? 'Agent Coordination Notes',
    contentPreview:
      overrides.contentPreview ?? 'These are notes about coordinating agents across the platform.',
    score: overrides.score ?? 0.85,
    matchType: overrides.matchType ?? 'semantic',
    metadata: overrides.metadata ?? { scopes: ['work.engineering'] },
  };
}

describe('CitationParser', () => {
  let parser: CitationParser;

  beforeEach(() => {
    parser = new CitationParser();
  });

  describe('valid citation mapping', () => {
    it('extracts a single bracketed engram ID', () => {
      const sources = [makeResult()];
      const llmOutput =
        'The agents coordinate via message passing [eng_20260417_0942_agent-coordination].';

      const result = parser.parse(llmOutput, sources);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.id).toBe('eng_20260417_0942_agent-coordination');
      expect(result.citations[0]!.type).toBe('engram');
      expect(result.citations[0]!.title).toBe('Agent Coordination Notes');
      expect(result.citations[0]!.scope).toBe('work.engineering');
    });

    it('extracts multiple distinct citations', () => {
      const sources = [
        makeResult({ sourceId: 'eng_20260417_0942_agent-coordination', score: 0.9 }),
        makeResult({
          sourceId: 'eng_20260418_1030_pipeline-design',
          title: 'Pipeline Design',
          score: 0.7,
        }),
      ];
      const llmOutput =
        'Agents coordinate [eng_20260417_0942_agent-coordination] and pipelines are designed [eng_20260418_1030_pipeline-design].';

      const result = parser.parse(llmOutput, sources);

      expect(result.citations).toHaveLength(2);
      // Ordered by relevance (highest first).
      expect(result.citations[0]!.id).toBe('eng_20260417_0942_agent-coordination');
      expect(result.citations[1]!.id).toBe('eng_20260418_1030_pipeline-design');
    });

    it('deduplicates same citation referenced multiple times', () => {
      const sources = [makeResult()];
      const llmOutput =
        'First mention [eng_20260417_0942_agent-coordination] and again [eng_20260417_0942_agent-coordination].';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations).toHaveLength(1);
    });
  });

  describe('hallucinated citation stripping', () => {
    it('strips citations not in the retrieved set', () => {
      const sources = [makeResult()];
      const llmOutput =
        'Real [eng_20260417_0942_agent-coordination] and fake [eng_20260501_1111_nonexistent].';

      const result = parser.parse(llmOutput, sources);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.id).toBe('eng_20260417_0942_agent-coordination');
      // Hallucinated citation is removed from the cleaned answer.
      expect(result.cleanedAnswer).not.toContain('[eng_20260501_1111_nonexistent]');
    });

    it('cleans up double spaces after stripping', () => {
      const sources = [makeResult()];
      const llmOutput = 'Before [eng_20260501_1111_nonexistent] after the fake citation.';

      const result = parser.parse(llmOutput, sources);
      expect(result.cleanedAnswer).not.toMatch(/  /);
    });
  });

  describe('typed citations [sourceType:sourceId]', () => {
    it('extracts typed citation references', () => {
      const sources = [
        makeResult({
          sourceType: 'transaction',
          sourceId: 'txn_001',
          title: 'Coffee Purchase',
          metadata: {
            scopes: ['personal.finance'],
            amount: -4.5,
            date: '2026-04-15',
            category: 'Food',
          },
        }),
      ];
      const llmOutput = 'You bought coffee [transaction:txn_001] on April 15th.';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.id).toBe('txn_001');
      expect(result.citations[0]!.type).toBe('transaction');
    });

    it('strips hallucinated typed citations', () => {
      const sources = [makeResult()];
      const llmOutput = 'Fake typed [media:mov_999] reference.';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations).toHaveLength(0);
      expect(result.cleanedAnswer).not.toContain('[media:mov_999]');
    });
  });

  describe('excerpt truncation', () => {
    it('returns full content preview when under 200 chars', () => {
      const sources = [makeResult({ contentPreview: 'Short content.' })];
      const llmOutput = 'Answer [eng_20260417_0942_agent-coordination].';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations[0]!.excerpt).toBe('Short content.');
    });

    it('truncates at word boundary with ellipsis when over 200 chars', () => {
      const longContent = 'word '.repeat(50); // 250 chars
      const sources = [makeResult({ contentPreview: longContent })];
      const llmOutput = 'Answer [eng_20260417_0942_agent-coordination].';

      const result = parser.parse(llmOutput, sources);
      const excerpt = result.citations[0]!.excerpt;
      expect(excerpt.length).toBeLessThanOrEqual(201); // 200 + ellipsis char
      expect(excerpt.endsWith('…')).toBe(true);
    });
  });

  describe('domain-specific formatting', () => {
    it('includes amount, date, category for transactions', () => {
      const sources = [
        makeResult({
          sourceType: 'transaction',
          sourceId: 'eng_20260417_0942_txn-coffee',
          title: 'Coffee',
          contentPreview: 'Bought coffee at the corner cafe.',
          metadata: {
            scopes: ['personal.finance'],
            amount: -4.5,
            date: '2026-04-15',
            category: 'Food',
          },
        }),
      ];
      const llmOutput = 'You bought coffee [eng_20260417_0942_txn-coffee].';

      const result = parser.parse(llmOutput, sources);
      const excerpt = result.citations[0]!.excerpt;
      expect(excerpt).toContain('Amount: -4.5');
      expect(excerpt).toContain('Date: 2026-04-15');
      expect(excerpt).toContain('Category: Food');
    });

    it('includes type and rating for media', () => {
      const sources = [
        makeResult({
          sourceType: 'media',
          sourceId: 'eng_20260417_0942_media-inception',
          title: 'Inception',
          contentPreview: 'A mind-bending thriller about dreams.',
          metadata: {
            scopes: ['personal.media'],
            type: 'movie',
            rating: 8.8,
          },
        }),
      ];
      const llmOutput = 'You watched Inception [eng_20260417_0942_media-inception].';

      const result = parser.parse(llmOutput, sources);
      const excerpt = result.citations[0]!.excerpt;
      expect(excerpt).toContain('Type: movie');
      expect(excerpt).toContain('Rating: 8.8');
    });

    it('includes location for inventory', () => {
      const sources = [
        makeResult({
          sourceType: 'inventory',
          sourceId: 'eng_20260417_0942_inv-macbook',
          title: 'MacBook Pro',
          contentPreview: 'M3 MacBook Pro 14 inch.',
          metadata: {
            scopes: ['personal.inventory'],
            location: 'Home Office',
          },
        }),
      ];
      const llmOutput = 'Your MacBook [eng_20260417_0942_inv-macbook] is in the office.';

      const result = parser.parse(llmOutput, sources);
      const excerpt = result.citations[0]!.excerpt;
      expect(excerpt).toContain('Location: Home Office');
    });
  });

  describe('ordering', () => {
    it('orders citations by relevance score (highest first)', () => {
      const sources = [
        makeResult({ sourceId: 'eng_20260417_0942_low-relevance', score: 0.3 }),
        makeResult({ sourceId: 'eng_20260418_1030_high-relevance', score: 0.95, title: 'High' }),
        makeResult({ sourceId: 'eng_20260419_0800_mid-relevance', score: 0.6, title: 'Mid' }),
      ];
      const llmOutput =
        'Low [eng_20260417_0942_low-relevance], high [eng_20260418_1030_high-relevance], mid [eng_20260419_0800_mid-relevance].';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations[0]!.relevance).toBe(0.95);
      expect(result.citations[1]!.relevance).toBe(0.6);
      expect(result.citations[2]!.relevance).toBe(0.3);
    });
  });

  describe('zero valid citations', () => {
    it('returns empty citations when all are hallucinated', () => {
      const sources = [makeResult()];
      const llmOutput = 'All fake [eng_20260501_1111_nonexistent] citations.';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations).toHaveLength(0);
    });

    it('returns empty citations when LLM output has no citations', () => {
      const sources = [makeResult()];
      const llmOutput = 'A plain answer without any citations.';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations).toHaveLength(0);
    });
  });

  describe('mixed valid/invalid citations', () => {
    it('keeps valid and strips invalid citations', () => {
      const sources = [
        makeResult({ sourceId: 'eng_20260417_0942_agent-coordination', score: 0.8 }),
      ];
      const llmOutput =
        'Valid [eng_20260417_0942_agent-coordination] and invalid [eng_20260501_1111_fake].';

      const result = parser.parse(llmOutput, sources);
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.id).toBe('eng_20260417_0942_agent-coordination');
      expect(result.cleanedAnswer).toContain('[eng_20260417_0942_agent-coordination]');
      expect(result.cleanedAnswer).not.toContain('[eng_20260501_1111_fake]');
    });
  });
});
