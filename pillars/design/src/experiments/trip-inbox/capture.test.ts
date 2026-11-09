import { describe, expect, it } from 'vitest';

import { createInboxState } from './fixture';
import { addInboxFiles, captureInboxItem, inboxRows, removeInboxFile } from './model';

describe('verbatim material capture', () => {
  it('captures raw text without classification and never interprets its dates, city or kind', () => {
    const state = createInboxState('empty');
    state.capture.draft.text = '  Meet someone in Recife in January.\nDo not extract these words. ';
    const result = captureInboxItem(state, 'raw-source');
    const source = result.state.capture.items[0];
    expect(result.error).toBeNull();
    expect(source?.text).toBe(state.capture.draft.text);
    expect(source?.kind).toBeUndefined();
    expect(source).toMatchObject({ visitId: '', title: '', start: '', end: '' });
    expect(result.state.targets).toBe(state.targets);
    expect(result.state.associations).toBe(state.associations);
    expect(result.state.capture.draft.text).toBe('');
    expect(state.capture.items).toEqual([]);
    expect(inboxRows(result.state, { query: '', organisation: 'unorganised' })).toHaveLength(1);
  });

  it('allows raw link-only material and optional manually selected capture kind without marking organisation', () => {
    const state = createInboxState('empty');
    state.capture.draft = {
      ...state.capture.draft,
      url: 'https://source.example.test/notes',
      kind: 'link',
    };
    const result = captureInboxItem(state, 'source-link');
    expect(result.error).toBeNull();
    expect(result.state.capture.items[0]).toMatchObject({
      url: state.capture.draft.url,
      kind: 'link',
    });
    expect(inboxRows(result.state, { query: '', organisation: 'organised' })).toEqual([]);
  });

  it('rejects blank material, duplicate IDs and unknown-source identity rebinding atomically', () => {
    const state = createInboxState('empty');
    state.capture.draft.kind = 'event';
    expect(captureInboxItem(state, 'new').state).toBe(state);
    const stale = createInboxState('missing-reference');
    stale.capture.draft.text = 'Actual source material';
    for (const id of ['', ' ', 'capture-recife-note', 'removed-source'] as const) {
      const result = captureInboxItem(stale, id);
      expect(result.state).toBe(stale);
      expect(result.error).not.toBeNull();
    }
  });
});

describe('actual pending file handles', () => {
  it('adds and removes exact pending occurrences, then preserves the selected File objects in the captured original', () => {
    const state = createInboxState('empty');
    const file = new File(['Local original'], 'notes.txt', { type: 'text/plain' });
    const pending = addInboxFiles(state, [file, file]);
    expect(pending.capture.draft.files).toEqual([file, file]);
    expect(pending.capture.draft.files[0]).toBe(file);
    const removed = removeInboxFile(pending, 0);
    expect(removed.capture.draft.files).toEqual([file]);
    for (const index of [-1, 2, 0.5, Number.NaN])
      expect(removeInboxFile(pending, index)).toBe(pending);
    const captured = captureInboxItem(removed, 'file-source');
    expect(captured.error).toBeNull();
    expect(captured.state.capture.items[0]?.files[0]).toBe(file);
    expect(captured.state.capture.draft.files).toEqual([]);
    expect(captured.state.targets).toBe(state.targets);
    expect(captured.state.associations).toEqual([]);
    expect(removed.capture.draft.files).toEqual([file]);
  });

  it('creates independent fixture metadata and actual pending file objects', () => {
    const state = createInboxState('files');
    const file = state.capture.draft.files[0];
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe('brazil-notes.txt');
    state.capture.items.splice(0, 1);
    expect(createInboxState().capture.items).toHaveLength(2);
    expect(createInboxState('files').capture.draft.files[0]).not.toBe(file);
  });
});
