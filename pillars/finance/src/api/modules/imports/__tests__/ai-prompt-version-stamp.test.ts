/**
 * Every categorizer shape stamps its entries with the prompt revision that
 * produced them (POPS-3677). The stamp is what lets a committed outcome be
 * joined back to a prompt, so a shape that forgets it — or stamps a sibling's
 * version — silently attributes its accept rate to the wrong revision.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../../db/index.js';
import { invalidateAiSettingsCache } from '../../ai-settings-resolver.js';
import {
  PROMPT_VERSION_CATEGORIZE,
  PROMPT_VERSION_CATEGORIZE_BATCH,
  PROMPT_VERSION_TAGS_ONLY,
} from '../ai-categorizer-prompt.js';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { categorizeBatchWithAi, categorizeWithAi, tagsOnlyBatchWithAi } =
  await import('../ai-categorizer.js');

const VOCAB = ['venue:supermarket', 'contains:groceries'];

function reply(text: string) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } };
}

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  createMock.mockReset();
  invalidateAiSettingsCache();
  process.env['FINANCE_AI_CATEGORIZER_ENABLED'] = 'true';
  process.env['ANTHROPIC_API_KEY'] = 'test-key';
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-prompt-version-stamp-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  delete process.env['ANTHROPIC_API_KEY'];
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('prompt version stamping', () => {
  it('stamps a single-row entry with the categorize version', async () => {
    createMock.mockResolvedValue(
      reply('{"entityName": "Woolworths", "venue": "supermarket", "confidence": 0.9}')
    );

    const { result } = await categorizeWithAi({ description: 'WOOLWORTHS' }, undefined, VOCAB, {
      db,
    });

    expect(result?.promptVersion).toBe(PROMPT_VERSION_CATEGORIZE);
  });

  it('stamps every non-null batch entry with the batch version and leaves a null slot null', async () => {
    createMock.mockResolvedValue(
      reply('[{"entityName": "Woolworths", "venue": "supermarket", "confidence": 0.9}, 7]')
    );

    const { results } = await categorizeBatchWithAi(
      [{ description: 'WOOLWORTHS' }, { description: 'X' }],
      undefined,
      VOCAB,
      { db }
    );

    expect(results[0]?.promptVersion).toBe(PROMPT_VERSION_CATEGORIZE_BATCH);
    expect(results[1]).toBeNull();
  });

  it('stamps a tag-only entry with the tags-only version', async () => {
    createMock.mockResolvedValue(reply('[{"venue": "supermarket"}]'));

    const { results } = await tagsOnlyBatchWithAi(
      [{ entityName: 'Woolworths', input: { description: 'WOOLWORTHS' } }],
      undefined,
      VOCAB,
      { db }
    );

    expect(results[0]?.promptVersion).toBe(PROMPT_VERSION_TAGS_ONLY);
  });

  it('gives the three shapes three distinct versions', () => {
    expect(
      new Set([
        PROMPT_VERSION_CATEGORIZE,
        PROMPT_VERSION_CATEGORIZE_BATCH,
        PROMPT_VERSION_TAGS_ONLY,
      ]).size
    ).toBe(3);
  });
});
