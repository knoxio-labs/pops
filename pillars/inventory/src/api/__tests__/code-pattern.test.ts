import { describe, expect, it } from 'vitest';

import {
  CODE_PATTERN_KEY,
  DEFAULT_CODE_PATTERN,
  SUGGEST_CODES_KEY,
} from '../../contract/settings/code-pattern.js';
import { settings } from '../../db/index.js';
import { parseCodePattern, readCodeSettings, renderAffixes } from '../sync/code-pattern.js';
import { openSyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();

describe('inventory code patterns', () => {
  it('parses literals, {type} and one # run', () => {
    const pattern = parseCodePattern('A{type}-{###}');

    expect(pattern).toEqual({
      before: [{ kind: 'literal', text: 'A' }, { kind: 'type' }, { kind: 'literal', text: '-' }],
      width: 3,
      after: [],
    });
  });

  it('refuses two # runs, seven #, and characters outside the rule', () => {
    expect(parseCodePattern('{type}{#}-{##}')).toBeNull();
    expect(parseCodePattern('{type}{#######}')).toBeNull();
    expect(parseCodePattern('{type}_{##}')).toBeNull();
  });

  it('refuses {type}-{room}', () => {
    expect(parseCodePattern('{type}-{room}')).toBeNull();
  });

  it('renders affixes with the type letter', () => {
    const pattern = parseCodePattern('{type}-{###}-A');
    if (pattern === null) throw new Error('expected a valid pattern');

    expect(renderAffixes(pattern, 'C')).toEqual({ prefix: 'C-', suffix: '-A' });
  });

  it('reads stored rows and falls back to manifest defaults', () => {
    const harness = openSyncHarness(transport);
    try {
      expect(readCodeSettings(harness.db.db)).toEqual({
        suggest: true,
        pattern: DEFAULT_CODE_PATTERN,
      });
      harness.db.db
        .insert(settings)
        .values([
          { key: SUGGEST_CODES_KEY, value: 'false' },
          { key: CODE_PATTERN_KEY, value: 'B{###}' },
        ])
        .run();

      expect(readCodeSettings(harness.db.db)).toEqual({ suggest: false, pattern: 'B{###}' });
    } finally {
      harness.close();
    }
  });
});
