import { describe, expect, it } from 'vitest';

import {
  CODE_PATTERN_RULE,
  inventorySettingsSection,
  INVENTORY_SETTING_KEYS,
} from './inventory-settings-manifest';
import { initialSection, sectionReducer } from './settings-section-model';

const KEYS = INVENTORY_SETTING_KEYS;

const saved = {
  [KEYS.paperlessUrl]: 'https://paperless.wattle.home',
  [KEYS.codePattern]: '{type}{##}',
  [KEYS.suggestCodes]: 'true',
};

const start = initialSection(saved, { kind: 'not-set-up' });

describe('code pattern rule', () => {
  const rule = new RegExp(CODE_PATTERN_RULE, 'u');

  it.each(['{type}{##}', 'B{###}', 'KIT-{#}', '{type}-{######}', 'X{##}{type}'])(
    'accepts %s',
    (pattern) => expect(rule.test(pattern)).toBe(true)
  );

  it.each([
    ['no number', '{type}-'],
    ['two numbers', '{#}{#}'],
    ['an unknown part', '{type}-{room}{#}'],
    ['a space', 'B {##}'],
    ['an unclosed brace', 'B{##'],
    ['seven digits', 'B{#######}'],
    ['nothing', ''],
  ])('refuses %s', (_why, pattern) => expect(rule.test(pattern)).toBe(false));
});

describe('the designed manifest', () => {
  it('gives every setting one key and every select a default among its options', () => {
    const fields = inventorySettingsSection.groups.flatMap((group) => group.fields);
    expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
    for (const field of fields.filter((entry) => entry.type === 'select')) {
      expect(field.options?.map((option) => option.value)).toContain(field.default);
    }
  });
});

describe('sectionReducer', () => {
  it('saves a valid change and marks it saving until the store answers', () => {
    const next = sectionReducer(start, { type: 'change', key: KEYS.codePattern, value: 'B{###}' });
    expect(next.values[KEYS.codePattern]).toBe('B{###}');
    expect(next.saveStates[KEYS.codePattern]).toBe('saving');
    expect(sectionReducer(next, { type: 'saved', key: KEYS.codePattern }).saveStates).toEqual({
      [KEYS.codePattern]: 'saved',
    });
  });

  it('holds an invalid value in its field without saving it', () => {
    const next = sectionReducer(start, {
      type: 'change',
      key: KEYS.codePattern,
      value: '{type}-{room}',
    });
    expect(next.values[KEYS.codePattern]).toBe('{type}{##}');
    expect(next.drafts[KEYS.codePattern]).toBe('{type}-{room}');
    expect(next.saveStates[KEYS.codePattern]).toBeUndefined();
  });

  it('clears the held value once the field passes again', () => {
    const held = sectionReducer(start, { type: 'change', key: KEYS.codePattern, value: 'B{' });
    const fixed = sectionReducer(held, { type: 'change', key: KEYS.codePattern, value: 'B{#}' });
    expect(fixed.drafts).toEqual({});
    expect(fixed.values[KEYS.codePattern]).toBe('B{#}');
  });

  it('ignores a key the section does not declare', () => {
    expect(sectionReducer(start, { type: 'change', key: 'finance.other', value: 'x' })).toBe(start);
  });

  it('does not mark a field saved that was not saving', () => {
    expect(sectionReducer(start, { type: 'saved', key: KEYS.codePattern })).toBe(start);
  });

  it('tests the saved address, and not at all without one', () => {
    expect(sectionReducer(start, { type: 'test-start' }).paperless).toEqual({
      kind: 'testing',
      url: 'https://paperless.wattle.home',
    });
    const blank = initialSection({ ...saved, [KEYS.paperlessUrl]: '' }, { kind: 'not-set-up' });
    expect(sectionReducer(blank, { type: 'test-start' })).toBe(blank);
  });
});
