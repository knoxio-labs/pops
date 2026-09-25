import { describe, expect, it } from 'vitest';

import { parsePattern, previewCodes, renderCode, typeLetter } from './code-pattern';
import { dirtyKeys, initialSettings, saveBlocker, settingsReducer } from './settings-model';

import type { InventorySettings } from './settings-model';

const saved: InventorySettings = {
  paperlessUrl: 'https://paperless.home',
  paperlessTokenSet: true,
  suggestCodes: true,
  codePattern: '{type}{##}',
  labelSheetId: 'L7160',
  labelTemplate: 'auto',
  density: 'compact',
};

describe('parsePattern', () => {
  it('reads text, the type letter and a padded number', () => {
    expect(parsePattern('box-{type}{###}')).toEqual({
      ok: true,
      parts: [{ kind: 'text', text: 'BOX-' }, { kind: 'type' }, { kind: 'number', width: 3 }],
    });
  });

  it('names the first problem', () => {
    expect(parsePattern('  ')).toEqual({
      ok: false,
      error: 'Enter a pattern, or turn suggestions off.',
    });
    expect(parsePattern('{type}')).toEqual({
      ok: false,
      error: 'Add {#} so each code gets its own number.',
    });
    expect(parsePattern('{#}{##}')).toEqual({ ok: false, error: 'Use one number, not several.' });
    expect(parsePattern('{room}{#}')).toEqual({
      ok: false,
      error: 'Unknown part {room}. Use {type} or {#}.',
    });
    expect(parsePattern('{type{#}')).toEqual({ ok: false, error: 'A brace is not closed.' });
    expect(parsePattern('{#}}')).toEqual({ ok: false, error: 'A brace is not closed.' });
    expect(parsePattern('A_{#}')).toEqual({
      ok: false,
      error: 'Use only letters, digits and hyphens.',
    });
    expect(parsePattern('{#######}').ok).toBe(false);
  });
});

describe('renderCode', () => {
  it('pads to the minimum width and grows past it', () => {
    const parsed = parsePattern('{type}{##}');
    if (!parsed.ok) throw new Error(parsed.error);
    expect(renderCode(parsed.parts, 'Electronics', 7)).toBe('E07');
    expect(renderCode(parsed.parts, 'Electronics', 123)).toBe('E123');
    expect(renderCode(parsed.parts, null, 1)).toBe('X01');
  });

  it('takes the first letter, skipping digits and symbols', () => {
    expect(typeLetter('3D prints')).toBe('D');
    expect(typeLetter('')).toBe('X');
  });
});

describe('previewCodes', () => {
  it('renders every sample', () => {
    expect(
      previewCodes('{type}{##}', [
        { typeName: 'Moving box', next: 13 },
        { typeName: 'Tools', next: 2 },
      ])
    ).toEqual({
      ok: true,
      codes: ['M13', 'T02'],
    });
  });

  it('refuses a code too long for the label', () => {
    expect(previewCodes('HOUSE-{type}{####}', [{ typeName: 'Tools', next: 1 }])).toEqual({
      ok: false,
      error: 'HOUSE-T0001 is 11 characters; labels fit 10.',
    });
  });
});

describe('settingsReducer', () => {
  const start = initialSettings(saved, { kind: 'not-set-up' });

  it('tracks dirty keys and discards back to saved', () => {
    const edited = settingsReducer(start, { type: 'edit', patch: { density: 'comfortable' } });
    expect(dirtyKeys(edited)).toEqual(['density']);
    expect(dirtyKeys(settingsReducer(edited, { type: 'discard' }))).toEqual([]);
  });

  it('saves a valid draft and marks it saved', () => {
    const edited = settingsReducer(start, { type: 'edit', patch: { codePattern: 'K{##}' } });
    const next = settingsReducer(edited, { type: 'save' });
    expect(next.saved.codePattern).toBe('K{##}');
    expect(next.justSaved).toBe(true);
    expect(dirtyKeys(next)).toEqual([]);
  });

  it('refuses to save an invalid pattern, a bad address, or nothing', () => {
    expect(saveBlocker(start)).toBe('Nothing has changed.');
    const bad = settingsReducer(start, { type: 'edit', patch: { codePattern: '{type}' } });
    expect(settingsReducer(bad, { type: 'save' })).toBe(bad);
    expect(saveBlocker(bad)).toBe(
      'Fix the code pattern first. Add {#} so each code gets its own number.'
    );
    const off = settingsReducer(bad, { type: 'edit', patch: { suggestCodes: false } });
    expect(saveBlocker(off)).toBeNull();
    const url = settingsReducer(start, { type: 'edit', patch: { paperlessUrl: 'paperless.home' } });
    expect(saveBlocker(url)).toBe('The Paperless address must start with http:// or https://.');
  });

  it('tests the address being edited, and not an empty one', () => {
    const edited = settingsReducer(start, {
      type: 'edit',
      patch: { paperlessUrl: 'http://10.0.0.5:8000' },
    });
    expect(settingsReducer(edited, { type: 'test-start' }).paperless).toEqual({
      kind: 'testing',
      url: 'http://10.0.0.5:8000',
    });
    const empty = settingsReducer(start, { type: 'edit', patch: { paperlessUrl: '' } });
    expect(settingsReducer(empty, { type: 'test-start' })).toBe(empty);
  });

  it('clears the saved confirmation on the next edit', () => {
    const savedState = settingsReducer(
      settingsReducer(start, { type: 'edit', patch: { density: 'comfortable' } }),
      { type: 'save' }
    );
    expect(
      settingsReducer(savedState, { type: 'edit', patch: { density: 'compact' } }).justSaved
    ).toBe(false);
  });
});
