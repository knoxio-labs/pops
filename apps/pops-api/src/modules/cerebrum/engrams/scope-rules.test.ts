import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { ScopeRuleEngine, resolveScopes } from './scope-rules.js';

import type { ScopeRulesConfig } from './scope-rules.js';

// ---------------------------------------------------------------------------
// resolveScopes (pure function tests — no filesystem)
// ---------------------------------------------------------------------------

const baseConfig: ScopeRulesConfig = {
  defaults: { fallback_scope: 'personal.captures' },
  rules: [
    { match: { source: 'github' }, assign: ['work.projects'], priority: 10 },
    { match: { source: 'moltbot' }, assign: ['personal.captures'], priority: 20 },
    {
      match: { source: 'manual', tags: ['therapy'] },
      assign: ['personal.secret.therapy'],
      priority: 30,
    },
    { match: { type: 'journal' }, assign: ['personal.journal'], priority: 5 },
  ],
};

describe('resolveScopes', () => {
  it('returns explicit scopes when provided', () => {
    const result = resolveScopes({ source: 'github', explicitScopes: ['work.custom'] }, baseConfig);
    expect(result).toEqual(['work.custom']);
  });

  it('matches single condition and assigns scopes', () => {
    expect(resolveScopes({ source: 'github' }, baseConfig)).toEqual(['work.projects']);
    expect(resolveScopes({ source: 'moltbot' }, baseConfig)).toEqual(['personal.captures']);
  });

  it('applies all matching rules additively', () => {
    const config: ScopeRulesConfig = {
      defaults: { fallback_scope: 'personal.captures' },
      rules: [
        { match: { source: 'github' }, assign: ['work.projects'], priority: 10 },
        { match: { type: 'meeting' }, assign: ['work.meetings'], priority: 5 },
      ],
    };
    const result = resolveScopes({ source: 'github', type: 'meeting' }, config);
    expect(result).toContain('work.projects');
    expect(result).toContain('work.meetings');
    expect(result).toHaveLength(2);
  });

  it('falls back to fallback_scope when no rules match', () => {
    expect(resolveScopes({ source: 'cli' }, baseConfig)).toEqual(['personal.captures']);
  });

  it('falls back when input is empty', () => {
    expect(resolveScopes({}, baseConfig)).toEqual(['personal.captures']);
  });

  it('matches tag-based rule with set intersection', () => {
    // Rule requires tag 'therapy' — engram has ['therapy', 'extra']
    const result = resolveScopes({ source: 'manual', tags: ['therapy', 'extra'] }, baseConfig);
    expect(result).toContain('personal.secret.therapy');
  });

  it('does not match tag rule if required tag missing', () => {
    const result = resolveScopes({ source: 'manual', tags: ['other'] }, baseConfig);
    expect(result).not.toContain('personal.secret.therapy');
    expect(result).toEqual(['personal.captures']); // fallback
  });

  it('deduplicates scopes from multiple matching rules', () => {
    const config: ScopeRulesConfig = {
      defaults: { fallback_scope: 'personal.captures' },
      rules: [
        { match: { source: 'github' }, assign: ['work.projects'], priority: 10 },
        { match: { type: 'meeting' }, assign: ['work.projects'], priority: 5 },
      ],
    };
    const result = resolveScopes({ source: 'github', type: 'meeting' }, config);
    expect(result).toEqual(['work.projects']);
  });

  it('deduplicates explicit scopes', () => {
    const result = resolveScopes(
      { explicitScopes: ['work.projects', 'work.projects', 'personal.journal'] },
      baseConfig
    );
    expect(result).toEqual(['work.projects', 'personal.journal']);
  });
});

// ---------------------------------------------------------------------------
// ScopeRuleEngine (filesystem tests)
// ---------------------------------------------------------------------------

describe('ScopeRuleEngine', () => {
  let root: string;
  let configDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scope-rules-'));
    configDir = join(root, '.config');
    mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeToml(content: string): void {
    writeFileSync(join(configDir, 'scope-rules.toml'), content, 'utf8');
  }

  it('parses a valid scope-rules.toml', () => {
    writeToml(`
[defaults]
fallback_scope = "personal.captures"

[[rules]]
match = { source = "github" }
assign = ["work.projects"]
priority = 10

[[rules]]
match = { type = "journal" }
assign = ["personal.journal"]
priority = 5
`);
    const engine = new ScopeRuleEngine(root);
    const config = engine.getConfig();
    expect(config.defaults.fallback_scope).toBe('personal.captures');
    expect(config.rules).toHaveLength(2);
  });

  it('falls back to personal.captures when file is missing', () => {
    const engine = new ScopeRuleEngine(root);
    expect(engine.inferScopes({ source: 'anything' })).toEqual(['personal.captures']);
  });

  it('falls back to personal.captures on parse error', () => {
    writeToml('this is not valid toml ===== !!!');
    const engine = new ScopeRuleEngine(root);
    expect(engine.inferScopes({})).toEqual(['personal.captures']);
  });

  it('skips rules with invalid assign scopes (logs warning)', () => {
    writeToml(`
[defaults]
fallback_scope = "personal.captures"

[[rules]]
match = { source = "github" }
assign = ["INVALID"]
priority = 10

[[rules]]
match = { source = "moltbot" }
assign = ["personal.captures"]
priority = 5
`);
    const engine = new ScopeRuleEngine(root);
    const config = engine.getConfig();
    // First rule had only invalid assigns → skipped; second rule is valid
    expect(config.rules).toHaveLength(1);
    expect(config.rules[0]?.match.source).toBe('moltbot');
  });

  it('normalises fallback_scope to lowercase', () => {
    writeToml(`
[defaults]
fallback_scope = "Personal.Captures"
`);
    const engine = new ScopeRuleEngine(root);
    expect(engine.getConfig().defaults.fallback_scope).toBe('personal.captures');
  });

  it('inferScopes returns explicit scopes bypassing rules', () => {
    writeToml(`
[defaults]
fallback_scope = "personal.captures"

[[rules]]
match = { source = "github" }
assign = ["work.projects"]
priority = 10
`);
    const engine = new ScopeRuleEngine(root);
    expect(engine.inferScopes({ source: 'github', explicitScopes: ['work.custom'] })).toEqual([
      'work.custom',
    ]);
  });

  it('resetCache forces config reload', () => {
    const engine = new ScopeRuleEngine(root);
    expect(engine.inferScopes({})).toEqual(['personal.captures']); // missing file fallback

    writeToml(`
[defaults]
fallback_scope = "work.projects"
`);
    // Without reset, still returns old config
    expect(engine.inferScopes({})).toEqual(['personal.captures']);

    engine.resetCache();
    expect(engine.inferScopes({})).toEqual(['work.projects']);
  });

  it('matches all rules additively when multiple match', () => {
    writeToml(`
[defaults]
fallback_scope = "personal.captures"

[[rules]]
match = { source = "github" }
assign = ["work.projects"]
priority = 10

[[rules]]
match = { type = "meeting" }
assign = ["work.meetings"]
priority = 5
`);
    const engine = new ScopeRuleEngine(root);
    const result = engine.inferScopes({ source: 'github', type: 'meeting' });
    expect(result).toContain('work.projects');
    expect(result).toContain('work.meetings');
  });

  it('handles missing match in rule gracefully', () => {
    writeToml(`
[defaults]
fallback_scope = "personal.captures"

[[rules]]
assign = ["work.projects"]
priority = 10
`);
    const engine = new ScopeRuleEngine(root);
    // Rule without match should be skipped
    expect(engine.getConfig().rules).toHaveLength(0);
  });

  it('handles missing assign in rule gracefully', () => {
    writeToml(`
[defaults]
fallback_scope = "personal.captures"

[[rules]]
match = { source = "github" }
priority = 10
`);
    const engine = new ScopeRuleEngine(root);
    expect(engine.getConfig().rules).toHaveLength(0);
  });
});
