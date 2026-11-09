import { describe, expect, it } from 'vitest';

import { createTripDocumentsState } from './fixture';
import {
  addTripDocumentFiles,
  attachTripDocumentSelection,
  documentRows,
  removeTripDocumentFile,
  setTripDocumentTarget,
  toggleTripDocumentSelection,
  unlinkTripDocument,
} from './model';

describe('approved local link and selection semantics', () => {
  it('links selected originals atomically without changing metadata, cross-links, provenance or offline evidence', () => {
    const state = createTripDocumentsState();
    const selected = toggleTripDocumentSelection(
      toggleTripDocumentSelection(state, 'document-hotel'),
      'document-image'
    );
    const generated: string[] = [];
    const result = attachTripDocumentSelection(selected, (documentId) => {
      generated.push(documentId);
      return `new-${documentId}`;
    });
    expect(result.error).toBeNull();
    expect(generated).toEqual(['document-hotel', 'document-image']);
    expect(result.state.linking.links).toHaveLength(state.linking.links.length + 2);
    expect(result.state.linking.selectedIds).toEqual([]);
    expect(result.state.linking.documents).toBe(state.linking.documents);
    expect(result.state.offline).toBe(state.offline);
    expect(result.state.provenance).toBe(state.provenance);
    expect(result.state.targetVisits).toBe(state.targetVisits);
    expect(state.linking.selectedIds).toEqual([]);
    expect(selected.linking.selectedIds).toEqual(['document-hotel', 'document-image']);
  });

  it('rejects duplicate association IDs or invalid targets atomically while retaining selections', () => {
    const state = createTripDocumentsState();
    const selected = toggleTripDocumentSelection(
      toggleTripDocumentSelection(state, 'document-hotel'),
      'document-image'
    );
    for (const id of ['', ' ', 'same-id', 'link-flight-trip'] as const) {
      const result = attachTripDocumentSelection(selected, () => id);
      expect(result.state).toBe(selected);
      expect(result.error).toBe('Choose distinct link identifiers.');
    }
    const missing = { ...selected, linking: { ...selected.linking, targetId: 'missing' } };
    const result = attachTripDocumentSelection(missing, () => 'new-id');
    expect(result.state).toBe(missing);
    expect(result.error).toBe('Choose an available target.');
  });

  it('does not relink the same original to a target or treat unavailable originals as selectable', () => {
    const state = createTripDocumentsState();
    const selected = toggleTripDocumentSelection(state, 'document-confirmation');
    expect(attachTripDocumentSelection(selected, () => 'duplicate').state).toBe(selected);
    expect(toggleTripDocumentSelection(state, 'missing')).toBe(state);
    expect(toggleTripDocumentSelection(state, 'document-unavailable')).toBe(state);
    expect(setTripDocumentTarget(state, 'missing')).toBe(state);
    const tripTarget = setTripDocumentTarget(
      toggleTripDocumentSelection(state, 'document-image'),
      'trip-brazil'
    );
    expect(tripTarget.linking.selectedIds).toEqual(['document-image']);
    const linked = attachTripDocumentSelection(tripTarget, () => 'image-trip');
    expect(linked.error).toBeNull();
    expect(linked.state.linking.links).toContainEqual({
      id: 'image-trip',
      documentId: 'document-image',
      targetId: 'trip-brazil',
    });
  });

  it('unlinks exactly one selected association including broken endpoints, retaining originals and other links for undo', () => {
    const state = createTripDocumentsState('missing-reference');
    const unlinked = unlinkTripDocument(state, 'link-flight-journey');
    expect(unlinked.linking.links.some((link) => link.id === 'link-flight-journey')).toBe(false);
    expect(unlinked.linking.links).toContainEqual({
      id: 'link-flight-trip',
      documentId: 'document-confirmation',
      targetId: 'trip-brazil',
    });
    expect(unlinked.linking.documents).toBe(state.linking.documents);
    expect(
      unlinkTripDocument(state, 'link-missing-target').linking.links.some(
        (link) => link.id === 'link-missing-target'
      )
    ).toBe(false);
    const removed = unlinkTripDocument(state, 'link-removed-document');
    expect(
      documentRows(removed, { query: '', mimeType: '', source: 'all', offline: 'all' }).some(
        (row) => row.id === 'document-removed'
      )
    ).toBe(false);
    expect(state.linking.links.some((link) => link.id === 'link-removed-document')).toBe(true);
    expect(unlinkTripDocument(state, 'unknown')).toBe(state);
    const linked = createTripDocumentsState();
    const detached = unlinkTripDocument(linked, 'link-hotel-stay');
    expect(
      documentRows(detached, { query: '', mimeType: '', source: 'all', offline: 'all' }).some(
        (row) => row.id === 'document-hotel'
      )
    ).toBe(false);
    expect(detached.linking.documents.find((document) => document.id === 'document-hotel')).toBe(
      linked.linking.documents.find((document) => document.id === 'document-hotel')
    );
    expect(toggleTripDocumentSelection(detached, 'document-hotel').linking.selectedIds).toEqual([
      'document-hotel',
    ]);
  });
});

describe('actual pending browser files remain separate', () => {
  it('retains actual File identities without uploading, copying originals or changing offline facts', () => {
    const state = createTripDocumentsState();
    const file = new File(['User-selected local source'], 'flight-confirmation.pdf', {
      type: 'text/plain',
    });
    const selected = addTripDocumentFiles(state, [file, file]);
    expect(selected.linking.files).toEqual([file, file]);
    expect(selected.linking.files[0]).toBe(file);
    expect(selected.linking.documents).toBe(state.linking.documents);
    expect(selected.linking.links).toBe(state.linking.links);
    expect(selected.offline).toBe(state.offline);
    const linked = attachTripDocumentSelection(
      toggleTripDocumentSelection(selected, 'document-image'),
      () => 'image-new'
    );
    expect(linked.state.linking.files).toBe(selected.linking.files);
    const removed = removeTripDocumentFile(selected, 0);
    expect(removed.linking.files).toEqual([file]);
    expect(removed.linking.files[0]).toBe(file);
    expect(selected.linking.files).toHaveLength(2);
    for (const index of [-1, 2, 0.5, Number.NaN])
      expect(removeTripDocumentFile(selected, index)).toBe(selected);
  });

  it('creates independent fictional metadata and selection snapshots', () => {
    const state = createTripDocumentsState();
    state.linking.documents.splice(0, 1);
    state.offline.splice(0, 1);
    expect(createTripDocumentsState().linking.documents).toHaveLength(4);
    expect(createTripDocumentsState().offline).toHaveLength(3);
    expect(createTripDocumentsState().linking.files).toEqual([]);
  });
});
