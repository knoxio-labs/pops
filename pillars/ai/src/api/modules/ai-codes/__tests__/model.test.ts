import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../../../db/index.js';
import { codesModelId, createAnthropicCodeModel, DEFAULT_CODES_MODEL } from '../model.js';

describe('codesModelId', () => {
  it('uses the default when the override is unset or blank', () => {
    expect(codesModelId({})).toBe(DEFAULT_CODES_MODEL);
    expect(codesModelId({ AI_CODES_MODEL: '  ' })).toBe(DEFAULT_CODES_MODEL);
  });

  it('honours the override', () => {
    expect(codesModelId({ AI_CODES_MODEL: 'claude-sonnet-5-5' })).toBe('claude-sonnet-5-5');
  });
});

describe('createAnthropicCodeModel', () => {
  let tmpDir: string;
  let aiDb: OpenedAiDb;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ai-codes-model-test-'));
    aiDb = openAiDb(join(tmpDir, 'ai.db'));
    for (const name of ['ANTHROPIC_API_KEY_FILE', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    aiDb.raw.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('is null when no API key is configured', () => {
    expect(createAnthropicCodeModel(aiDb.db)).toBeNull();
  });

  it('is built when the key is in the environment', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

    expect(createAnthropicCodeModel(aiDb.db)).toBeTypeOf('function');
  });
});
