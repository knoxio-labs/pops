import { describe, expect, it } from 'vitest';

import { createDuplicateState } from './fixture';
import {
  duplicatePreviewError,
  duplicateSources,
  previewDuplicateMerge,
  separateDuplicatePair,
} from './model';

describe('explicit duplicate selection', () => {
  it('resolves selection order without replacing a missing source', () => {
    const state = createDuplicateState();
    state.pairIds.reverse();
    expect(duplicateSources(state).map((source) => source.id)).toEqual(state.pairIds);
    state.pairIds = ['missing', 'contact-marina'];
    expect(duplicateSources(state).map((source) => source.id)).toEqual(['contact-marina']);
    expect(duplicatePreviewError(state)).toBe('A selected contact is unavailable.');
    expect(previewDuplicateMerge(state)).toBeNull();
  });

  it.each([
    [],
    ['contact-marina'],
    ['contact-marina', 'contact-marina'],
    ['contact-marina', 'contact-clara', 'contact-pousada'],
  ])('requires exactly two distinct sources %j', (...pairIds) => {
    const state = createDuplicateState();
    state.pairIds = pairIds;
    expect(duplicatePreviewError(state)).not.toBeNull();
    expect(previewDuplicateMerge(state)).toBeNull();
  });

  it.each(['retainedId', 'nameSourceId', 'kindSourceId'] as const)(
    'requires explicit valid %s',
    (key) => {
      const state = createDuplicateState();
      state[key] = 'contact-clara';
      expect(duplicatePreviewError(state)).toBe(
        'Choose the retained identity, name and kind from this pair.'
      );
      expect(previewDuplicateMerge(state)).toBeNull();
      state[key] = '';
      expect(previewDuplicateMerge(state)).toBeNull();
    }
  );

  it('does not decide validity from identical names or shared facts', () => {
    const sameName = createDuplicateState('same-name');
    expect(duplicateSources(sameName).map((source) => source.name)).toEqual([
      'Marina Duarte',
      'Marina Duarte',
    ]);
    expect(duplicatePreviewError(sameName)).toBeNull();
    expect(previewDuplicateMerge(sameName)?.methods).toHaveLength(5);
    expect(previewDuplicateMerge(createDuplicateState('missing-reference'))).toBeNull();
    expect(duplicatePreviewError(createDuplicateState('empty'))).toBe(
      'Select two contacts to compare.'
    );
  });
});

describe('attributed preview facts', () => {
  it('uses separate explicit name, kind and retained identity selections', () => {
    const state = createDuplicateState();
    const sources = duplicateSources(state);
    const second = sources[1];
    if (!second) throw new Error('Missing comparison fixture');
    second.kind = 'organisation';
    state.nameSourceId = second.id;
    state.kindSourceId = second.id;
    expect(previewDuplicateMerge(state)).toMatchObject({
      retainedId: 'contact-marina',
      name: 'Marina B. Duarte',
      kind: 'organisation',
    });
  });

  it('retains conflicting, repeated and partial optional facts without normalising or deduplicating', () => {
    const state = createDuplicateState();
    const sources = duplicateSources(state);
    for (const source of sources) {
      source.aliases = [' Shared alias ', '', ' '];
      source.methods = [
        { id: 'same-id', label: ' Custom ', value: '' },
        { id: 'blank', label: ' ', value: '' },
      ];
      source.addresses = [
        { id: 'same-id', label: '', city: ' 東京 ', value: '' },
        { id: 'blank', label: '', city: ' ', value: '' },
      ];
      source.notes = ` Notes from ${source.id} \n`;
    }
    const preview = previewDuplicateMerge(state);
    expect(preview?.aliases).toEqual(
      sources.map((source) => ({ sourceId: source.id, value: ' Shared alias ' }))
    );
    expect(preview?.methods).toEqual(
      sources.map((source) => ({ sourceId: source.id, method: source.methods[0] }))
    );
    expect(preview?.addresses).toEqual(
      sources.map((source) => ({ sourceId: source.id, address: source.addresses[0] }))
    );
    expect(preview?.notes).toEqual(
      sources.map((source) => ({ sourceId: source.id, value: source.notes }))
    );
    sources.forEach((source) => {
      source.notes = ' ';
      source.aliases = [];
    });
    expect(previewDuplicateMerge(state)?.notes).toEqual([]);
    expect(previewDuplicateMerge(state)?.aliases).toEqual([]);
  });

  it('projects pair references while retaining original IDs and excluding unrelated references', () => {
    const state = createDuplicateState();
    const original = structuredClone(state.references);
    const preview = previewDuplicateMerge(state);
    expect(preview?.references).toEqual(
      original.slice(0, 2).map(({ contactId, ...reference }) => ({
        ...reference,
        originalContactId: contactId,
        resolvedContactId: state.retainedId,
      }))
    );
    expect(state.references).toEqual(original);
    expect(preview?.references.some((reference) => reference.id === 'unrelated')).toBe(false);
  });

  it('preserves full external provenance and isolates preview objects from source objects', () => {
    const state = createDuplicateState('finance');
    const before = structuredClone(state);
    const preview = previewDuplicateMerge(state);
    if (!preview) throw new Error('Missing preview fixture');
    expect(duplicateSources(state)[1]?.origin).toBe('Finance');
    expect(duplicateSources(state)[1]?.legacy).toMatchObject({
      defaultTags: ['workshop'],
      defaultTransactionType: 'expense',
    });
    expect(preview.retainedId).toBe('contact-marina-comparison');
    preview.methods.forEach((item) => {
      item.method.value = 'Changed preview only';
    });
    preview.addresses.forEach((item) => {
      item.address.city = 'Changed preview only';
    });
    preview.references.forEach((item) => {
      item.title = 'Changed preview only';
    });
    expect(state).toEqual(before);
  });

  it('marks the pair separate without removing or rewriting any record', () => {
    const state = createDuplicateState();
    const separated = separateDuplicatePair(state);
    expect(separated).toEqual({ ...state, separated: true });
    expect(separated.contacts).toBe(state.contacts);
    expect(separated.references).toBe(state.references);
    expect(state.separated).toBe(false);
    expect(previewDuplicateMerge(separated)).toBeNull();
    expect(duplicatePreviewError(separated)).toBe('This pair is kept separate.');
  });
});
