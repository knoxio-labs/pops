import { describe, expect, it, vi } from 'vitest';

import { initialDocumentLinking } from './fixture';
import {
  addDocumentFiles,
  attachSelected,
  filteredDocuments,
  pendingDocuments,
  removeDocumentFile,
  setDocumentTarget,
  toggleDocumentSelection,
  unlinkDocument,
} from './model';

describe('document linking', () => {
  it('searches title and filename case-insensitively including unavailable sources', () => {
    const state = initialDocumentLinking();
    expect(
      filteredDocuments({ ...state, query: '  BRAZIL ' }).map((document) => document.id)
    ).toEqual(['document-confirmation']);
    expect(
      filteredDocuments({ ...state, query: 'MAP.PNG' }).map((document) => document.id)
    ).toEqual(['document-image']);
    expect(
      filteredDocuments({ ...state, query: 'previous' }).map((document) => document.id)
    ).toEqual(['document-unavailable']);
    expect(filteredDocuments({ ...state, query: ' ' })).toEqual(state.documents);
    expect(filteredDocuments({ ...state, query: 'absent' })).toEqual([]);
  });

  it('toggles known available selections without duplicates', () => {
    const initial = initialDocumentLinking();
    const state = toggleDocumentSelection(initial, 'document-image');
    expect(state.selectedIds).toEqual(['document-image']);
    expect(toggleDocumentSelection(state, 'document-image').selectedIds).toEqual([]);
    expect(toggleDocumentSelection(initial, 'document-unavailable')).toBe(initial);
    expect(toggleDocumentSelection(initial, 'missing')).toBe(initial);
    expect(initial.selectedIds).toEqual([]);
  });

  it('ignores missing, unavailable, duplicate and already linked selections', () => {
    const state = {
      ...initialDocumentLinking(),
      selectedIds: [
        'document-confirmation',
        'document-image',
        'document-image',
        'document-unavailable',
        'missing',
      ],
    };
    expect(pendingDocuments(state).map((document) => document.id)).toEqual(['document-image']);
    const newId = vi.fn((documentId: string) => `link-${documentId}`);
    const next = attachSelected(state, newId);
    expect(newId).toHaveBeenCalledExactlyOnceWith('document-image');
    expect(next.links).toHaveLength(state.links.length + 1);
    expect(next.links.at(-1)).toEqual({
      id: 'link-document-image',
      documentId: 'document-image',
      targetId: state.targetId,
    });
    expect(next.documents).toEqual(state.documents);
    expect(next.selectedIds).toEqual([]);
    expect(attachSelected({ ...next, selectedIds: ['document-image'] }, newId).links).toEqual(
      next.links
    );
    expect(newId).toHaveBeenCalledTimes(1);
  });

  it('keeps selections and links unchanged when target is unavailable', () => {
    const state = {
      ...initialDocumentLinking('missing-reference'),
      selectedIds: ['document-image'],
    };
    const newId = vi.fn((documentId: string) => documentId);
    expect(attachSelected(state, newId)).toBe(state);
    expect(newId).not.toHaveBeenCalled();
    expect(state.selectedIds).toEqual(['document-image']);
  });

  it('unlinks an association without deleting its document or another target association', () => {
    const state = initialDocumentLinking();
    const next = unlinkDocument(state, 'link-flight-journey');
    expect(next.documents).toEqual(state.documents);
    expect(next.links).toEqual(state.links.filter((link) => link.id !== 'link-flight-journey'));
    expect(next.links).toContainEqual({
      id: 'link-flight-trip',
      documentId: 'document-confirmation',
      targetId: 'trip-brazil',
    });
    expect(state.links).toHaveLength(3);
    expect(unlinkDocument(state, 'missing').links).toEqual(state.links);
  });

  it('retains selections across target changes and evaluates links against the new target', () => {
    const initial = {
      ...initialDocumentLinking(),
      selectedIds: ['document-confirmation', 'document-hotel'],
    };
    const next = setDocumentTarget(initial, 'visit-curitiba');
    expect(next.selectedIds).toEqual(initial.selectedIds);
    expect(pendingDocuments(next).map((document) => document.id)).toEqual([
      'document-confirmation',
      'document-hotel',
    ]);
    expect(
      pendingDocuments(setDocumentTarget(next, 'stay-olinda')).map((document) => document.id)
    ).toEqual(['document-confirmation']);
    expect(setDocumentTarget(initial, 'missing')).toBe(initial);
    expect(initial.targetId).toBe('journey-brazil');
  });

  it('stores real files separately without inventing documents or completed links', () => {
    const state = initialDocumentLinking();
    const file = new File(['fictional confirmation'], 'confirmation.pdf', {
      type: 'application/pdf',
    });
    const sameName = new File(['different bytes'], 'confirmation.pdf', { type: 'application/pdf' });
    const files = [file, sameName, file];
    const next = addDocumentFiles(state, files);
    expect(next.files).toHaveLength(3);
    expect(next.files[0]).toBe(file);
    expect(next.files[1]).toBe(sameName);
    expect(next.files[2]).toBe(file);
    expect(next.documents).toEqual(state.documents);
    expect(next.links).toEqual(state.links);
    expect(pendingDocuments(next)).toEqual([]);
    files.pop();
    expect(next.files).toHaveLength(3);
    const attached = attachSelected(
      { ...next, selectedIds: ['document-image'] },
      (id) => `new-${id}`
    );
    expect(attached.files[0]).toBe(file);
    expect(attached.documents).toEqual(state.documents);
  });

  it('removes only one indexed file occurrence even for identical object references', () => {
    const file = new File(['map'], 'map.png', { type: 'image/png' });
    const other = new File(['booking'], 'booking.pdf', { type: 'application/pdf' });
    const state = addDocumentFiles(initialDocumentLinking(), [file, other, file]);
    const next = removeDocumentFile(state, 0);
    expect(next.files).toHaveLength(2);
    expect(next.files[0]).toBe(other);
    expect(next.files[1]).toBe(file);
    expect(state.files).toHaveLength(3);
    expect(removeDocumentFile(state, 2).files).toEqual([file, other]);
    for (const index of [-1, 3, 0.5, NaN, Infinity])
      expect(removeDocumentFile(state, index)).toBe(state);
  });

  it('provides independent fixture snapshots and explicit unavailable and broken sources', () => {
    const first = initialDocumentLinking();
    const second = initialDocumentLinking();
    first.documents[0]!.title = 'Changed locally';
    first.links.pop();
    first.targets.pop();
    expect(second.documents[0]?.title).toBe('Brazil flight confirmation');
    expect(second.links).toHaveLength(3);
    expect(second.targets).toHaveLength(5);
    expect(initialDocumentLinking('empty').documents).toEqual([]);
    expect(initialDocumentLinking('empty').targets).toHaveLength(5);
    const unavailable = initialDocumentLinking('unavailable');
    expect(unavailable.links.some((link) => link.documentId === 'document-unavailable')).toBe(true);
    const missing = initialDocumentLinking('missing-reference');
    expect(missing.targets.some((target) => target.id === missing.targetId)).toBe(false);
    expect(
      missing.links.some(
        (link) => !missing.documents.some((document) => document.id === link.documentId)
      )
    ).toBe(true);
  });
});
