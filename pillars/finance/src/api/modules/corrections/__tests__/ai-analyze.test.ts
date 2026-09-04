/**
 * Unit tests for the closed-set/few-shot grounding added to the corrections
 * AI cluster (CF062/#3661): `loadRecentAcceptedCorrections` reads the most
 * recently accepted rules, and `buildAnalyzePrompt`/`buildGeneratePrompt`
 * render them as a bounded few-shot block.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactionCorrections,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import {
  buildAnalyzePrompt,
  loadRecentAcceptedCorrections,
  type AcceptedCorrectionExample,
} from '../ai-analyze.js';
import { buildGeneratePrompt } from '../ai-generate-rules.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-analyze-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function insertCorrection(overrides: {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityName: string | null;
  tags: string[];
  isActive?: boolean;
  createdAt: string;
}): void {
  db.insert(transactionCorrections)
    .values({
      descriptionPattern: overrides.descriptionPattern,
      matchType: overrides.matchType,
      entityName: overrides.entityName,
      tags: JSON.stringify(overrides.tags),
      isActive: overrides.isActive ?? true,
      createdAt: overrides.createdAt,
    })
    .run();
}

describe('loadRecentAcceptedCorrections', () => {
  it('returns an empty list when there are no correction rules', () => {
    expect(loadRecentAcceptedCorrections(db)).toEqual([]);
  });

  it('returns active rules newest-first', () => {
    insertCorrection({
      descriptionPattern: 'ALDI',
      matchType: 'contains',
      entityName: 'Aldi',
      tags: ['Groceries'],
      createdAt: '2026-01-01 00:00:00',
    });
    insertCorrection({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      entityName: 'Woolworths',
      tags: ['Groceries'],
      createdAt: '2026-02-01 00:00:00',
    });

    const examples = loadRecentAcceptedCorrections(db);
    expect(examples.map((e) => e.pattern)).toEqual(['WOOLWORTHS', 'ALDI']);
  });

  it('excludes disabled rules', () => {
    insertCorrection({
      descriptionPattern: 'DISABLED_RULE',
      matchType: 'contains',
      entityName: 'Disabled Co',
      tags: [],
      isActive: false,
      createdAt: '2026-03-01 00:00:00',
    });

    expect(loadRecentAcceptedCorrections(db)).toEqual([]);
  });

  it('caps the result at 5 examples', () => {
    for (let i = 0; i < 8; i++) {
      insertCorrection({
        descriptionPattern: `MERCHANT_${i}`,
        matchType: 'contains',
        entityName: `Merchant ${i}`,
        tags: [],
        createdAt: `2026-01-${String(i + 1).padStart(2, '0')} 00:00:00`,
      });
    }

    expect(loadRecentAcceptedCorrections(db)).toHaveLength(5);
  });
});

describe('buildAnalyzePrompt — few-shot grounding', () => {
  const input = { description: 'WOOLWORTHS 2246', entityName: 'Woolworths', amount: -45.2 };

  it('renders no few-shot block when there are no examples', () => {
    expect(buildAnalyzePrompt(input)).not.toContain('Examples of rules already accepted');
  });

  it('renders accepted examples as a few-shot block', () => {
    const examples: AcceptedCorrectionExample[] = [
      { pattern: 'ALDI', matchType: 'contains', entityName: 'Aldi', tags: ['Groceries'] },
    ];
    const prompt = buildAnalyzePrompt(input, examples);
    expect(prompt).toContain('Examples of rules already accepted');
    expect(prompt).toContain('pattern: "ALDI" (contains) -> entity: Aldi, tags: Groceries');
  });
});

describe('buildGeneratePrompt — few-shot grounding', () => {
  const txns = [
    {
      description: 'WOOLWORTHS 2246',
      entityName: 'Woolworths',
      amount: -45.2,
      account: 'Everyday',
      currentTags: ['Groceries'],
    },
  ];

  it('renders no few-shot block when there are no examples', () => {
    expect(buildGeneratePrompt(txns, ['Groceries'])).not.toContain(
      'Examples of rules already accepted'
    );
  });

  it('renders accepted examples as a few-shot block', () => {
    const examples: AcceptedCorrectionExample[] = [
      { pattern: 'NETFLIX.COM', matchType: 'exact', entityName: 'Netflix', tags: [] },
    ];
    const prompt = buildGeneratePrompt(txns, ['Groceries'], examples);
    expect(prompt).toContain('pattern: "NETFLIX.COM" (exact) -> entity: Netflix');
  });
});
