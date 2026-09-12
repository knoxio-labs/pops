/**
 * An AI suggestion carries the prompt revision that produced it, and no other
 * source does (POPS-3677). A rule or entity tag stamped with a prompt version
 * would be counted in that prompt's accept rate although no model suggested it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  tagVocabularyService,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { buildAiSuggestedTags, suggestTags } from '../index.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-prompt-version-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('AI suggestion prompt version', () => {
  it('stamps each AI suggestion with the version it was given', () => {
    const suggested = buildAiSuggestedTags(
      ['venue:supermarket'],
      tagVocabularyService.loadKnownTagSet(db),
      { promptVersion: 'tags-v9.9', preAcceptThreshold: 0 }
    );

    expect(suggested).toEqual([
      expect.objectContaining({
        tag: 'venue:supermarket',
        source: 'ai',
        promptVersion: 'tags-v9.9',
      }),
    ]);
  });

  it('adds no promptVersion key when none was given', () => {
    const [suggestion] = buildAiSuggestedTags(
      ['venue:supermarket'],
      tagVocabularyService.loadKnownTagSet(db)
    );

    expect(suggestion).not.toHaveProperty('promptVersion');
  });

  it('stamps the AI pass only, never an entity-default tag on the same row', () => {
    const suggested = suggestTags(db, {
      description: 'WOOLWORTHS 2246',
      entityId: 'entity-1',
      aiTags: ['venue:supermarket'],
      aiProvenance: { promptVersion: 'categorize-v9.9', preAcceptThreshold: 0 },
      entityDefaultTags: new Map([['entity-1', ['contains:groceries']]]),
      recordTagRuleUsage: false,
    });

    expect(suggested.find((s) => s.source === 'ai')?.promptVersion).toBe('categorize-v9.9');
    expect(suggested.find((s) => s.source === 'entity')).not.toHaveProperty('promptVersion');
  });
});
