import { describe, expect, it } from 'vitest';

import { createTripDocumentsState } from './fixture';
import {
  documentOccurrences,
  documentRows,
  groupDocumentOccurrences,
  tripDocumentFindings,
  type TripDocumentFilters,
} from './model';

const all: TripDocumentFilters = { query: '', mimeType: '', source: 'all', offline: 'all' };

describe('original identity and explicit route references', () => {
  it('projects one document row per original and multiple source-backed route occurrences without copies', () => {
    const state = createTripDocumentsState();
    const before = structuredClone(state);
    const rows = documentRows(state, all);
    expect(rows).toHaveLength(2);
    const original = rows.find((row) => row.id === 'document-confirmation');
    if (!original) throw new Error('Missing original fixture');
    const occurrences = documentOccurrences(state, rows);
    const references = occurrences.filter((occurrence) => occurrence.row === original);
    expect(references).toHaveLength(3);
    expect(references.map((occurrence) => occurrence.visitId)).toEqual([
      'sydney-out',
      'arrival',
      '',
    ]);
    expect(original.document).toBe(state.linking.documents[0]);
    expect(original.links).toHaveLength(2);
    expect(new Set(occurrences.map((occurrence) => occurrence.row.id)).size).toBe(rows.length);
    const groups = groupDocumentOccurrences(state, occurrences);
    expect(groups.map((group) => group.id)).toEqual(['trip', 'sydney-out', 'arrival', 'recife']);
    expect(groups.some((group) => group.name === 'Not linked')).toBe(false);
    expect(
      rows.some((row) => row.id === 'document-image' || row.id === 'document-unavailable')
    ).toBe(false);
    expect(state.linking.documents).toHaveLength(4);
    expect(groups.flatMap((group) => group.occurrences)).toHaveLength(occurrences.length);
    expect(state).toEqual(before);
  });

  it('prioritises explicit trip targets independently of labels, visit mappings and input order', () => {
    const state = createTripDocumentsState();
    state.linking.targets = state.linking.targets.map((target) => ({
      ...target,
      label: target.kind === 'trip' ? 'Brazil' : 'Trip documents',
    }));
    state.targetVisits.push({ id: 'trip-context', targetId: 'trip-brazil', visitId: 'recife' });
    const occurrences = documentOccurrences(state, documentRows(state, all)).toReversed();
    const groups = groupDocumentOccurrences(state, occurrences);
    expect(groups.map((group) => group.id)).toEqual(['trip', 'sydney-out', 'arrival', 'recife']);
    const tripGroup = groups[0];
    if (!tripGroup) throw new Error('Trip document group missing');
    expect(tripGroup.occurrences).toHaveLength(1);
    expect(tripGroup.occurrences[0]?.target?.kind).toBe('trip');
  });

  it('keeps equal filenames or titles distinct when original identities differ', () => {
    const state = createTripDocumentsState('duplicate-names');
    expect(
      documentRows(state, { ...all, query: 'Brazil flight confirmation' }).map((row) => row.id)
    ).toEqual(['document-confirmation', 'document-hotel']);
    const sameName = documentRows(state, { ...all, query: 'flight-confirmation.pdf' });
    expect(sameName).toHaveLength(2);
    expect(sameName.map((row) => row.document?.size)).toEqual([184320, 98304]);
  });

  it('uses explicit target visit associations even for identical target labels and recurrent city visits', () => {
    const state = createTripDocumentsState();
    state.linking.targets = state.linking.targets.map((target) => ({
      ...target,
      label: 'Same label',
    }));
    state.targetVisits.push({
      id: 'explicit-return',
      targetId: 'journey-brazil',
      visitId: 'sydney-return',
    });
    const occurrences = documentOccurrences(state, documentRows(state, all));
    expect(
      occurrences
        .filter((occurrence) => occurrence.row.id === 'document-confirmation')
        .map((occurrence) => occurrence.visitId)
    ).toEqual(['sydney-out', 'arrival', 'sydney-return', '']);
    const groups = groupDocumentOccurrences(state, occurrences);
    expect(groups.filter((group) => group.name === 'Sydney').map((group) => group.id)).toEqual([
      'sydney-out',
      'sydney-return',
    ]);
    expect(new Set(occurrences.map((occurrence) => occurrence.id)).size).toBe(occurrences.length);
  });

  it('retains missing originals, targets and visits without substituting available metadata or labels', () => {
    const state = createTripDocumentsState('missing-reference');
    state.targetVisits.push({
      id: 'removed-visit-link',
      targetId: 'stay-olinda',
      visitId: 'removed-visit',
    });
    const rows = documentRows(state, all);
    const missing = rows.find((row) => row.id === 'document-removed');
    if (!missing) throw new Error('Missing broken source fixture');
    expect(missing.document).toBeUndefined();
    expect(missing.title).toBe('Document unavailable');
    expect(tripDocumentFindings(state, missing)).toContainEqual({
      id: 'missing-document',
      message: 'The original document is unavailable.',
    });
    const hotel = rows.find((row) => row.id === 'document-hotel');
    if (!hotel) throw new Error('Missing hotel fixture');
    expect(tripDocumentFindings(state, hotel).map((finding) => finding.message)).toEqual([
      'The linked route visit is unavailable.',
      'The linked target is unavailable.',
    ]);
    expect(documentRows(state, { ...all, query: 'Document unavailable' })).toEqual([]);
    expect(documentRows(state, { ...all, query: 'Target unavailable' })).toEqual([]);
    expect(
      documentOccurrences(state, [hotel]).some(
        (occurrence) =>
          occurrence.visitId === 'removed-visit' && occurrence.visitLabel === 'Visit unavailable'
      )
    ).toBe(true);
  });
});

describe('independent source and offline evidence', () => {
  it('never derives downloaded or accessible file facts from online availability', () => {
    const state = createTripDocumentsState();
    state.linking.links.push({
      id: 'explicit-image-link',
      documentId: 'document-image',
      targetId: 'trip-brazil',
    });
    const image = documentRows(state, all).find((row) => row.id === 'document-image');
    expect(image?.document?.availability).toBe('available');
    expect(image?.offline).toBeUndefined();
    expect(image?.provenance?.url).toBeUndefined();
    expect(documentRows(state, { ...all, offline: 'unknown' }).map((row) => row.id)).toEqual([
      'document-image',
    ]);
    expect(documentRows(state, { ...all, offline: 'not-downloaded' }).map((row) => row.id)).toEqual(
      ['document-hotel']
    );
    expect(
      documentRows(createTripDocumentsState('unavailable'), {
        ...all,
        source: 'unavailable',
        offline: 'failed',
      }).map((row) => row.id)
    ).toEqual(['document-unavailable']);
    expect(
      documentRows(createTripDocumentsState('offline'), { ...all, offline: 'stale' }).map(
        (row) => row.id
      )
    ).toEqual(['document-image']);
  });

  it('combines actual MIME, source, offline and linked-target text filters without catalogue-only matches', () => {
    const state = createTripDocumentsState();
    expect(
      documentRows(state, {
        ...all,
        query: 'SYD',
        mimeType: 'application/pdf',
        source: 'available',
        offline: 'ready',
      }).map((row) => row.id)
    ).toEqual(['document-confirmation']);
    expect(documentRows(state, { ...all, query: 'Birthday dinner' })).toEqual([]);
    state.linking.documents[0]!.title = 'Confirmação do voo';
    expect(documentRows(state, { ...all, query: 'CONFIRMACAO' }).map((row) => row.id)).toEqual([
      'document-confirmation',
    ]);
    expect(
      documentRows(state, { ...all, mimeType: 'application/pdf', offline: 'unknown' })
    ).toEqual([]);
    expect(documentRows(createTripDocumentsState('empty'), all)).toEqual([]);
  });
});
