import { describe, expect, it } from 'vitest';

import { createInboxState } from './fixture';
import {
  captureInboxHistory,
  changeInboxHistory,
  createInboxHistory,
  undoInboxHistory,
  updateInboxDraft,
} from './history';
import { linkInboxSource, type CaptureDraft } from './model';

function materialDraft(): CaptureDraft {
  return {
    text: '  Source material\nKeep the second line. ',
    url: 'https://source.example.test/notes',
    kind: 'document',
    visitId: 'recife',
    files: [new File(['Original local bytes'], 'notes.txt', { type: 'text/plain' })],
  };
}

describe('typed capture and organisation history', () => {
  it('leaves empty undo and unchanged model or draft updates as exact no-ops', () => {
    const state = createInboxState();
    const history = createInboxHistory(state);
    expect(history.state).toBe(state);
    expect(undoInboxHistory(history)).toEqual({ history, error: null });
    expect(undoInboxHistory(history).history).toBe(history);
    expect(changeInboxHistory(history, state)).toBe(history);
    expect(updateInboxDraft(history, state.capture.draft)).toBe(history);
    expect(captureInboxHistory(history, 'empty-material').history).toBe(history);
    expect(history.entries).toEqual([]);
  });

  it('restores the complete verbatim capture draft and actual File handles while removing only the created source', () => {
    const state = createInboxState();
    const draft = materialDraft();
    const before = updateInboxDraft(createInboxHistory(state), draft);
    const captured = captureInboxHistory(before, 'captured-source');
    expect(captured.error).toBeNull();
    expect(captured.history.entries.at(-1)?.kind).toBe('capture');
    expect(captured.history.state.capture.items[0]?.id).toBe('captured-source');
    expect(captured.history.state.capture.items[0]?.files[0]).toBe(draft.files[0]);
    expect(captured.history.state.capture.draft.files).toEqual([]);
    const restored = undoInboxHistory(captured.history);
    expect(restored.error).toBeNull();
    expect(restored.history.state.capture.draft).toEqual(draft);
    expect(restored.history.state.capture.draft.files[0]).toBe(draft.files[0]);
    expect(restored.history.state.capture.items).toBe(state.capture.items);
    expect(restored.history.state.targets).toBe(state.targets);
    expect(restored.history.state.associations).toBe(state.associations);
    expect(restored.history.entries).toEqual([]);
    expect(captured.history.state.capture.items[0]?.id).toBe('captured-source');
    expect(before.state.capture.draft).toBe(draft);
  });

  it.each(['text', 'url', 'file'] as const)(
    'rejects capture undo atomically when a new %s draft has material',
    (field) => {
      const initial = updateInboxDraft(createInboxHistory(createInboxState()), materialDraft());
      const captured = captureInboxHistory(initial, 'captured-source').history;
      const nextDraft: CaptureDraft = { text: '', url: '', visitId: '', files: [] };
      if (field === 'text') nextDraft.text = 'Current draft';
      if (field === 'url') nextDraft.url = 'https://current.example.test';
      if (field === 'file') nextDraft.files = [new File(['Current file'], 'current.txt')];
      const typing = updateInboxDraft(captured, nextDraft);
      const rejected = undoInboxHistory(typing);
      expect(rejected.history).toBe(typing);
      expect(rejected.error).toBe('Finish or clear the current draft before undoing capture.');
      expect(rejected.history.entries).toBe(typing.entries);
      expect(rejected.history.state.capture.draft).toBe(nextDraft);
      expect(rejected.history.state.capture.items[0]?.id).toBe('captured-source');
      const cleared = updateInboxDraft(rejected.history, {
        ...nextDraft,
        text: '',
        url: '',
        files: [],
      });
      const restored = undoInboxHistory(cleared);
      expect(restored.error).toBeNull();
      expect(
        restored.history.state.capture.items.some((item) => item.id === 'captured-source')
      ).toBe(false);
      expect(restored.history.state.capture.draft.text).toBe(materialDraft().text);
    }
  );

  it('undoes organisation without replacing the current typed draft or actual pending files', () => {
    const initial = createInboxHistory(createInboxState());
    const linked = linkInboxSource(initial.state, 'capture-recife-note', 'walk', 'source-link');
    expect(linked.error).toBeNull();
    const organised = changeInboxHistory(initial, linked.state);
    const draft = materialDraft();
    const typing = updateInboxDraft(organised, draft);
    const restored = undoInboxHistory(typing);
    expect(restored.error).toBeNull();
    expect(restored.history.state.associations).toBe(initial.state.associations);
    expect(restored.history.state.capture.items).toBe(initial.state.capture.items);
    expect(restored.history.state.capture.draft).toBe(draft);
    expect(restored.history.state.capture.draft.files[0]).toBe(draft.files[0]);
    expect(typing.state.associations).toHaveLength(1);
    expect(typing.entries).toHaveLength(1);
  });

  it('walks capture and intervening organisation entries in order without dropping either captured source', () => {
    const initial = createInboxHistory(createInboxState('empty'));
    const draftA = { ...materialDraft(), text: 'Source A' };
    const capturedA = captureInboxHistory(updateInboxDraft(initial, draftA), 'source-a').history;
    const linked = linkInboxSource(capturedA.state, 'source-a', 'walk', 'association-a');
    expect(linked.error).toBeNull();
    const organisedA = changeInboxHistory(capturedA, linked.state);
    expect(organisedA.entries.at(-1)?.kind).toBe('organisation');
    expect(organisedA.state.associations).toHaveLength(1);
    const draftB = { ...materialDraft(), text: 'Source B' };
    const capturedB = captureInboxHistory(updateInboxDraft(organisedA, draftB), 'source-b').history;
    const restoredB = undoInboxHistory(capturedB).history;
    expect(restoredB.state.capture.draft).toEqual(draftB);
    expect(restoredB.state.capture.items.map((item) => item.id)).toEqual(['source-a']);
    const removedAssociation = undoInboxHistory(restoredB).history;
    expect(removedAssociation.state.capture.draft).toBe(restoredB.state.capture.draft);
    expect(removedAssociation.state.associations).toEqual([]);
    expect(removedAssociation.entries).toHaveLength(1);
    expect(undoInboxHistory(removedAssociation).history).toBe(removedAssociation);
    const cleared = updateInboxDraft(removedAssociation, {
      ...draftB,
      text: '',
      url: '',
      files: [],
    });
    const restoredA = undoInboxHistory(cleared).history;
    expect(restoredA.state.capture.draft).toEqual(draftA);
    expect(restoredA.state.capture.items).toEqual([]);
    expect(restoredA.entries).toEqual([]);
    expect(capturedB.state.capture.items.map((item) => item.id)).toEqual(['source-b', 'source-a']);
  });

  it('does not record failed captures or let later draft-container edits corrupt the saved original', () => {
    const initial = createInboxHistory(createInboxState());
    const draft = materialDraft();
    const typing = updateInboxDraft(initial, draft);
    const failed = captureInboxHistory(typing, 'capture-recife-note');
    expect(failed.history).toBe(typing);
    expect(failed.error).not.toBeNull();
    const captured = captureInboxHistory(typing, 'source-new').history;
    const originalFile = draft.files[0];
    draft.files.splice(0, 1);
    const restored = undoInboxHistory(captured);
    expect(restored.history.state.capture.draft.files[0]).toBe(originalFile);
    expect(restored.history.state.capture.draft.kind).toBe('document');
    expect(restored.history.state.capture.draft.url).toBe('https://source.example.test/notes');
    expect(captured.entries).toHaveLength(1);
  });
});
