import { describe, expect, it } from 'vitest';

import { QueryScopeInferencer } from '../scope-inferencer.js';

const KNOWN_SCOPES = [
  'work.engineering',
  'work.meetings',
  'work.secret.credentials',
  'personal.journal',
  'personal.health',
  'personal.secret.keys',
  'general.notes',
];

function makeInferencer(): QueryScopeInferencer {
  return new QueryScopeInferencer();
}

describe('QueryScopeInferencer', () => {
  describe('explicit scopes', () => {
    it('returns explicit scopes unchanged when provided', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('anything', KNOWN_SCOPES, ['custom.scope']);
      expect(result.scopes).toEqual(['custom.scope']);
      expect(result.source).toBe('explicit');
    });

    it('skips inference entirely with explicit scopes', () => {
      const inferencer = makeInferencer();
      // Even though question contains "work", explicit scopes win.
      const result = inferencer.infer('work meeting notes', KNOWN_SCOPES, ['personal.journal']);
      expect(result.scopes).toEqual(['personal.journal']);
      expect(result.source).toBe('explicit');
    });

    it('filters secret scopes from explicit when includeSecret is false', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer(
        'anything',
        KNOWN_SCOPES,
        ['work.engineering', 'work.secret.credentials'],
        false
      );
      expect(result.scopes).toEqual(['work.engineering']);
      expect(result.source).toBe('explicit');
    });

    it('includes secret scopes from explicit when includeSecret is true', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer(
        'anything',
        KNOWN_SCOPES,
        ['work.engineering', 'work.secret.credentials'],
        true
      );
      expect(result.scopes).toEqual(['work.engineering', 'work.secret.credentials']);
      expect(result.source).toBe('explicit');
    });
  });

  describe('work keyword inference', () => {
    it.each([
      'What did I discuss in the meeting yesterday?',
      'Show my recent work notes',
      'What was discussed at the standup?',
      'Find my office notes',
      'What are the project deadlines?',
      'Which PRs did I review?',
      'When did we deploy the feature?',
      'Sprint retrospective notes',
    ])('infers work scopes for: "%s"', (question) => {
      const inferencer = makeInferencer();
      const result = inferencer.infer(question, KNOWN_SCOPES);
      expect(result.source).toBe('inferred');
      expect(result.scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('excludes work.secret.* scopes by default', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('work credentials', KNOWN_SCOPES);
      expect(result.scopes).not.toContain('work.secret.credentials');
    });

    it('includes work.secret.* scopes when includeSecret is true', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('work notes', KNOWN_SCOPES, undefined, true);
      expect(result.scopes).toContain('work.secret.credentials');
    });
  });

  describe('personal keyword inference', () => {
    it.each([
      'What did I write in my journal last week?',
      'Show my diary entries',
      'therapy session notes',
      'family plans for the weekend',
      'personal goals this month',
      'health checkup results',
      'exercise routine',
      'hobby projects I started',
    ])('infers personal scopes for: "%s"', (question) => {
      const inferencer = makeInferencer();
      const result = inferencer.infer(question, KNOWN_SCOPES);
      expect(result.source).toBe('inferred');
      expect(result.scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('excludes personal.secret.* scopes by default', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('personal notes', KNOWN_SCOPES);
      expect(result.scopes).not.toContain('personal.secret.keys');
    });
  });

  describe('ambiguous / default fallback', () => {
    it('returns all non-secret scopes for ambiguous questions', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('What happened last Tuesday?', KNOWN_SCOPES);
      expect(result.source).toBe('default');
      expect(result.scopes).toContain('work.engineering');
      expect(result.scopes).toContain('personal.journal');
      expect(result.scopes).toContain('general.notes');
      expect(result.scopes).not.toContain('work.secret.credentials');
      expect(result.scopes).not.toContain('personal.secret.keys');
    });

    it('returns empty scopes when knownScopes is empty', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('What happened?', []);
      expect(result.scopes).toEqual([]);
      expect(result.source).toBe('default');
    });

    it('returns empty scopes when knownScopes is undefined', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('What happened?');
      expect(result.scopes).toEqual([]);
      expect(result.source).toBe('default');
    });
  });

  describe('secret hard-block', () => {
    it('never includes secret scopes unless includeSecret=true', () => {
      const inferencer = makeInferencer();
      // All three paths: explicit, inferred, default.
      const explicit = inferencer.infer('x', KNOWN_SCOPES, ['work.secret.credentials']);
      expect(explicit.scopes).not.toContain('work.secret.credentials');

      const inferred = inferencer.infer('work notes', KNOWN_SCOPES);
      expect(inferred.scopes).not.toContain('work.secret.credentials');

      const defaultResult = inferencer.infer('anything', KNOWN_SCOPES);
      expect(defaultResult.scopes).not.toContain('work.secret.credentials');
      expect(defaultResult.scopes).not.toContain('personal.secret.keys');
    });

    it('includes secret scopes across all paths when includeSecret=true', () => {
      const inferencer = makeInferencer();
      const defaultResult = inferencer.infer('anything', KNOWN_SCOPES, undefined, true);
      expect(defaultResult.scopes).toContain('work.secret.credentials');
      expect(defaultResult.scopes).toContain('personal.secret.keys');
    });
  });

  describe('secret detection', () => {
    it.each(['Show me the secret notes', 'What is my password?', 'Find the credential for AWS'])(
      'detects secret mention in: "%s"',
      (question) => {
        const inferencer = makeInferencer();
        const notice = inferencer.detectSecretMention(question);
        expect(notice).toBeTruthy();
        expect(notice).toContain('sensitive data');
      }
    );

    it('returns null for non-secret questions', () => {
      const inferencer = makeInferencer();
      expect(inferencer.detectSecretMention('What did I eat yesterday?')).toBeNull();
    });

    it('detects "private key" multi-word keyword', () => {
      const inferencer = makeInferencer();
      const notice = inferencer.detectSecretMention('Where is my private key stored?');
      expect(notice).toBeTruthy();
    });
  });

  describe('keyword matching edge cases', () => {
    it('matches keywords case-insensitively', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('WORK MEETING NOTES', KNOWN_SCOPES);
      expect(result.source).toBe('inferred');
    });

    it('matches keywords at word boundaries (no partial match)', () => {
      const inferencer = makeInferencer();
      // "network" contains "work" as a substring, but word boundary prevents match.
      const result = inferencer.infer('Network configuration details', KNOWN_SCOPES);
      expect(result.source).toBe('default');
    });

    it('falls back to default when work keywords match but no work scopes exist', () => {
      const inferencer = makeInferencer();
      const result = inferencer.infer('work meeting', ['personal.journal', 'general.notes']);
      // No work.* scopes available, so falls through to personal check, then default.
      expect(result.source).toBe('default');
    });
  });
});
