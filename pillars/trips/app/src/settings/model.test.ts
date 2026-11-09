import { describe, expect, it } from 'vitest';

import { availableParents, draftInput, draftIssues, tripDraft } from './model';

import type { Tag, Trip } from '../api/types';

function trip(id: number, parentId: number | null = null): Trip {
  return {
    id,
    parentId,
    name: null,
    destination: '',
    when: '',
    tagId: null,
    notes: '',
    sourceLinks: [{ uri: 'https://example.test/original' }],
    createdAt: '2026-11-09T00:00:00Z',
    updatedAt: '2026-11-09T00:00:00Z',
  };
}

const tag: Tag = {
  id: 'tag-one',
  name: 'One',
  facet: 'trip',
  archived: false,
  archivedAt: null,
  description: null,
  mergedIntoId: null,
  parentId: null,
  window: null,
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};

describe('trip drafts', () => {
  it('allows all blank optional metadata without loading either catalogue', () => {
    const draft = tripDraft();
    expect(draftIssues(draft, undefined, undefined)).toEqual([]);
    expect(draftInput(draft)).toEqual({
      name: null,
      destination: '',
      when: '',
      tagId: null,
      parentId: null,
      notes: '',
    });
  });

  it('preserves opaque When and original nonblank text without copying source links', () => {
    const source: Trip = {
      ...trip(7, 2),
      name: '  Source name  ',
      destination: '  Québec  ',
      when: '  when the weather permits / 2028?  ',
      notes: '  source notes\n',
      tagId: tag.id,
    };
    const draft = tripDraft(source);
    expect(draft).toEqual({
      name: source.name,
      destination: source.destination,
      when: source.when,
      notes: source.notes,
      tagId: tag.id,
      parentId: '2',
    });
    expect(draftInput(draft)).toEqual({
      name: source.name,
      destination: source.destination,
      when: source.when,
      notes: source.notes,
      tagId: tag.id,
      parentId: 2,
    });
    expect(draftInput({ ...draft, name: ' \n ' })).toEqual({
      name: null,
      destination: source.destination,
      when: source.when,
      notes: source.notes,
      tagId: tag.id,
      parentId: 2,
    });
    expect(source.sourceLinks).toEqual([{ uri: 'https://example.test/original' }]);
  });

  it('omits unchanged source associations and permits their retention without catalogues', () => {
    const previous = tripDraft({ ...trip(7, 42), tagId: 'opaque-tag-reference' });
    const draft = { ...previous, notes: 'Metadata changed' };
    expect(draftIssues(draft, undefined, undefined, { id: 7, previous })).toEqual([]);
    expect(draftIssues(draft, [], [], { id: 7, previous })).toEqual([]);
    expect(draftInput(draft, previous)).toEqual({
      name: null,
      destination: '',
      when: '',
      notes: 'Metadata changed',
    });
    expect(draftInput(tripDraft(), tripDraft())).toEqual({
      name: null,
      destination: '',
      when: '',
      notes: '',
    });
  });

  it('validates changed associations independently and writes explicit clears as null', () => {
    const previous = tripDraft({ ...trip(7, 42), tagId: 'opaque-tag-reference' });
    const changed = { ...previous, parentId: '2', tagId: tag.id };
    expect(draftIssues(changed, undefined, undefined, { id: 7, previous })).toEqual([
      'parent',
      'tag',
    ]);
    expect(draftIssues(changed, [trip(2)], undefined, { id: 7, previous })).toEqual(['tag']);
    expect(draftIssues(changed, undefined, [tag], { id: 7, previous })).toEqual(['parent']);
    expect(draftIssues(changed, [trip(2)], [tag], { id: 7, previous })).toEqual([]);
    expect(draftInput(changed, previous)).toEqual({
      name: null,
      destination: '',
      when: '',
      notes: '',
      tagId: tag.id,
      parentId: 2,
    });
    const cleared = { ...previous, tagId: '', parentId: '' };
    expect(draftIssues(cleared, undefined, undefined, { id: 7, previous })).toEqual([]);
    expect(draftInput(cleared, previous)).toEqual({
      name: null,
      destination: '',
      when: '',
      notes: '',
      tagId: null,
      parentId: null,
    });
    expect(draftInput({ ...previous, tagId: '' }, previous)).toEqual({
      name: null,
      destination: '',
      when: '',
      notes: '',
      tagId: null,
    });
  });

  it('validates selected references independently and retains unavailable selection errors', () => {
    const draft = { ...tripDraft(), tagId: tag.id, parentId: '2' };
    expect(draftIssues(draft, undefined, undefined)).toEqual(['parent', 'tag']);
    expect(draftIssues(draft, [trip(2)], undefined)).toEqual(['tag']);
    expect(draftIssues(draft, undefined, [tag])).toEqual(['parent']);
    expect(draftIssues(draft, [trip(2)], [tag])).toEqual([]);
    expect(draftIssues(draft, [], [])).toEqual(['parent', 'tag']);
  });
});

describe('availableParents', () => {
  it('excludes self and transitive descendants even when the catalogue contains cycles', () => {
    const sources = [
      trip(9),
      trip(1, 3),
      trip(2, 1),
      trip(3, 2),
      trip(4, 3),
      trip(7, 8),
      trip(8, 7),
    ];
    const original = structuredClone(sources);
    expect(availableParents(sources, 1).map(({ id }) => id)).toEqual([9, 7, 8]);
    expect(sources).toEqual(original);
    expect(availableParents(sources)).toEqual(sources);
    for (const parentId of ['1', '2', '3', '4']) {
      expect(draftIssues({ ...tripDraft(), parentId }, sources, undefined, { id: 1 })).toEqual([
        'parent',
      ]);
    }
    expect(draftIssues({ ...tripDraft(), parentId: '9' }, sources, undefined, { id: 1 })).toEqual(
      []
    );
  });
});
