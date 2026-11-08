import { describe, expect, it } from 'vitest';

import { initialCapture } from './fixture';
import { candidateLink, captureItem, captureLabel, hasCapture, safeCaptureLink } from './model';

import type { CaptureDraft } from './model';

const emptyDraft = (): CaptureDraft => ({ text: '', url: '', files: [], visitId: '' });

describe('local source capture', () => {
  it('ignores whitespace and optional selections without changing history', () => {
    const state = initialCapture('default');
    state.draft = { ...emptyDraft(), text: ' \n\t', url: ' ', kind: 'event', visitId: 'recife' };
    expect(hasCapture(state.draft)).toBe(false);
    expect(captureItem(state, 'unused')).toBe(state);
  });

  it.each(['text', 'url', 'files'] as const)('accepts %s as the only material source', (source) => {
    const draft = emptyDraft();
    if (source === 'files') draft.files = [new File(['source'], 'notes.txt')];
    else draft[source] = 'source';
    expect(hasCapture(draft)).toBe(true);
  });

  it('retains verbatim sources, actual files and explicit selections without inference', () => {
    const file = new File(['original content'], 'notes.txt', { type: 'text/plain' });
    const state = initialCapture('empty');
    state.draft = {
      text: '  Festival 12 December\nOriginal notes  ',
      url: ' https://recife.example/source ',
      files: [file, new File(['second'], 'other.txt')],
      kind: 'event',
      visitId: 'recife',
    };
    const next = captureItem(state, 'new');
    expect(next.items[0]).toEqual({ ...state.draft, id: 'new', title: '', start: '', end: '' });
    expect(next.items[0]?.files[0]).toBe(file);
    expect(next.items[0]?.files).not.toBe(state.draft.files);
    expect(next.draft).toEqual({ ...emptyDraft(), kind: 'event', visitId: 'recife' });
    expect(state.draft.text).toContain('Original notes');
    expect(state.items).toEqual([]);
  });

  it('keeps classification unspecified and captures identical sources separately at the head', () => {
    const state = initialCapture('empty');
    state.draft.text = 'same source';
    const first = captureItem(state, 'first');
    const second = captureItem(
      { ...first, draft: { ...first.draft, text: 'same source' } },
      'second'
    );
    expect(second.items.map((item) => item.id)).toEqual(['second', 'first']);
    expect(second.items[0]?.kind).toBeUndefined();
    expect(second.draft.kind).toBeUndefined();
  });

  it('labels using title, first nonempty source line, filename, then URL without truncation', () => {
    const item = captureItem(
      { draft: { ...emptyDraft(), text: '\n first line \nsecond' }, items: [] },
      'label'
    ).items[0];
    expect(item).toBeDefined();
    if (!item) throw new Error('Capture missing');
    expect(captureLabel({ ...item, title: ' custom title ' })).toBe('custom title');
    expect(captureLabel(item)).toBe('first line');
    expect(
      captureLabel({
        ...item,
        text: '',
        files: [new File(['x'], 'source.txt')],
        url: 'https://source.example',
      })
    ).toBe('source.txt');
    const longUrl = `https://source.example/${'a'.repeat(300)}`;
    expect(captureLabel({ ...item, text: '', url: longUrl })).toBe(longUrl);
  });

  it('creates fresh fixture state and real plain text files', async () => {
    const first = initialCapture('default');
    first.items[0]?.files.push(new File(['x'], 'x.txt'));
    expect(initialCapture('default').items[0]?.files).toEqual([]);
    const file = initialCapture('document').draft.files[0];
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe('text/plain');
    expect(await file?.text()).toContain('Fictional Brazil trip');
    expect(initialCapture('missing-reference').items[0]?.visitId).toBe('missing-visit-reference');
  });
});

describe('explicit link candidates', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///secret',
    '/relative',
    '//source.example',
    'not a url',
    '',
  ])('rejects unsafe or non-absolute URL %s', (value) => {
    expect(safeCaptureLink(value)).toBeUndefined();
    expect(candidateLink(value)).toBeUndefined();
  });

  it('normalises absolute web URLs and suggests only whole-text URLs', () => {
    expect(safeCaptureLink(' HTTPS://source.example ')).toBe('https://source.example/');
    expect(candidateLink('\nhttp://source.example/path?date=2027-01-01\n')).toBe(
      'http://source.example/path?date=2027-01-01'
    );
    expect(candidateLink('See https://source.example')).toBeUndefined();
    expect(candidateLink('https://source.example\nFestival tomorrow')).toBeUndefined();
    expect(candidateLink('https://')).toBeUndefined();
  });
});
