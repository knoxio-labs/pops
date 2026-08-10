/**
 * `config-parse.mjs` is the one place the Tier B guards get a parser, so its
 * two guarantees are load-bearing for all of them (ADR-045, tier amendment):
 *
 *   1. The YAML schema is pinned. Under YAML 1.1 a workflow's `on:` key
 *      resolves to the boolean `true`, and every guard reading `doc.on` would
 *      then see `undefined`, find no triggers, and report clean.
 *   2. A document that cannot be read raises. Returning an empty object would
 *      let a guard scan nothing and print `OK`.
 */

import { describe, expect, it } from 'vitest';

import {
  ConfigParseError,
  formatPath,
  isMapping,
  parseToml,
  parseYaml,
  requireScalar,
  scalarText,
  walkMappings,
} from '../config-parse.mjs';

describe('parseYaml — the schema is pinned, not inherited', () => {
  it.each(['on', 'off', 'yes', 'no', 'y', 'n'])(
    'keeps `%s` a string key instead of resolving it to a boolean',
    (key) => {
      const doc = parseYaml(`${key}: value\n`, 'fixture.yml');
      expect(Object.keys(doc as object)).toEqual([key]);
    }
  );

  it('reads a real workflow trigger block back through `on`', () => {
    const doc = parseYaml('on:\n  pull_request:\n    paths: ["**"]\n', 'w.yml');
    expect((doc as { on: { pull_request: { paths: string[] } } }).on.pull_request.paths).toEqual([
      '**',
    ]);
  });

  it.each(['true', 'True', 'TRUE'])('still resolves `%s` to a boolean', (literal) => {
    expect(parseYaml(`flag: ${literal}\n`, 'f.yml')).toEqual({ flag: true });
  });

  it('raises a ConfigParseError naming the document', () => {
    expect(() => parseYaml('a:\n b:\n  - c\n - d\n', 'broken.yml')).toThrow(ConfigParseError);
    expect(() => parseYaml('a:\n b:\n  - c\n - d\n', 'broken.yml')).toThrow(/^broken\.yml/u);
  });
});

describe('parseToml', () => {
  it('reads a table', () => {
    expect(parseToml('[tools]\nnode = "24"\n', 'mise.toml')).toEqual({ tools: { node: '24' } });
  });

  it('raises a ConfigParseError naming the document', () => {
    expect(() => parseToml('[tools\nnode = "24"\n', 'mise.toml')).toThrow(ConfigParseError);
    expect(() => parseToml('[tools\n', 'mise.toml')).toThrow(/^mise\.toml could not be parsed/u);
  });
});

describe('walkMappings', () => {
  it('descends through mappings and sequences alike, indexing sequence items', () => {
    const doc = parseYaml('jobs:\n  a:\n    steps:\n      - run: echo hi\n', 'w.yml');
    const paths = [...walkMappings(doc)].map((entry) => formatPath(entry.path));
    // A sequence contributes its index to the path of the entries inside it,
    // but is not itself a key/value entry — only mapping keys are yielded.
    expect(paths).toEqual(['jobs', 'jobs.a', 'jobs.a.steps', 'jobs.a.steps.0.run']);
  });

  it('finds a key written as a flow mapping at the same path as the block form', () => {
    const block = [...walkMappings(parseYaml('a:\n  b:\n    c: 1\n', 'x.yml'))];
    const flow = [...walkMappings(parseYaml('a: { b: { c: 1 } }\n', 'x.yml'))];
    expect(flow.map((e) => formatPath(e.path))).toEqual(block.map((e) => formatPath(e.path)));
  });

  it('yields nothing for a scalar or a null document', () => {
    expect([...walkMappings(parseYaml('3\n', 'x.yml'))]).toEqual([]);
    expect([...walkMappings(parseYaml('', 'x.yml'))]).toEqual([]);
  });
});

describe('isMapping / scalarText', () => {
  it('does not call an array or null a mapping', () => {
    expect(isMapping({})).toBe(true);
    expect(isMapping([])).toBe(false);
    expect(isMapping(null)).toBe(false);
  });

  it('stringifies scalars and refuses everything else', () => {
    expect(scalarText('a')).toBe('a');
    expect(scalarText(24)).toBe('24');
    expect(scalarText(true)).toBe('true');
    expect(scalarText(['a'])).toBeUndefined();
    expect(scalarText({ a: 1 })).toBeUndefined();
    expect(scalarText(null)).toBeUndefined();
  });
});

describe('requireScalar — a value the caller cannot read is a violation', () => {
  it('returns the text for a scalar', () => {
    expect(requireScalar('Quality', 'ci-gate.yml', 'workflows[0]')).toBe('Quality');
  });

  it.each([
    [['a'], 'a sequence'],
    [{ a: 1 }, 'a mapping'],
    [null, 'null'],
  ])('raises for %j', (value, shape) => {
    expect(() => requireScalar(value, 'ci-gate.yml', 'workflows[0]')).toThrow(ConfigParseError);
    expect(() => requireScalar(value, 'ci-gate.yml', 'workflows[0]')).toThrow(
      new RegExp(`workflows\\[0\\] is ${shape}`, 'u')
    );
  });
});
