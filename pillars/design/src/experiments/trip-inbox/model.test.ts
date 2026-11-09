import { describe, expect, it } from 'vitest';

import { createInboxState } from './fixture';
import {
  captureInboxItem,
  inboxRows,
  inboxSourceRow,
  linkInboxSource,
  unlinkInboxAssociation,
  type InboxFilters,
} from './model';

const all: InboxFilters = { query: '', organisation: 'all' };

describe('raw sources and deterministic organisation', () => {
  it('keeps classified raw notes unorganised until an actual target association exists', () => {
    const state = createInboxState();
    const rows = inboxRows(state, all);
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.source?.kind && !row.organised && row.validAssociationCount === 0)
    ).toBe(true);
    const organised = createInboxState('organised');
    expect(inboxRows(organised, { ...all, organisation: 'organised' })).toHaveLength(2);
    expect(inboxRows(organised, { ...all, organisation: 'unorganised' })).toEqual([]);
    expect(inboxRows(createInboxState('empty'), all)).toEqual([]);
  });

  it('resolves the selected source outside list filters and retains equal source titles or target labels by identity', () => {
    const state = createInboxState('duplicate-names');
    expect(inboxRows(state, all).map((row) => row.label)).toEqual(['Travel note', 'Travel note']);
    const first = state.capture.items[0];
    const second = state.capture.items[1];
    if (!first || !second) throw new Error('Missing distinct captured sources');
    const linked = linkInboxSource(state, first.id, 'walk', 'first-association');
    const other = linkInboxSource(linked.state, second.id, 'friends', 'second-association');
    expect(other.error).toBeNull();
    expect(
      inboxRows(other.state, all).map((row) =>
        row.associations.map((entry) => entry.association.targetId)
      )
    ).toEqual([['walk'], ['friends']]);
    expect(inboxRows(other.state, { ...all, query: 'absent' })).toEqual([]);
    expect(inboxSourceRow(other.state, first.id)?.source).toBe(first);
    expect(inboxSourceRow(other.state, 'missing')).toBeNull();
  });

  it('searches actual source material, explicit visit and linked item facts with shared accent folding', () => {
    const state = createInboxState();
    const source = state.capture.items[0];
    if (!source) throw new Error('Missing source fixture');
    source.text = 'Conversar sobre a praça com Clara.';
    expect(inboxRows(state, { ...all, query: 'PRACA' }).map((row) => row.id)).toEqual([source.id]);
    expect(inboxRows(state, { ...all, query: 'Recife / Olinda' })).toHaveLength(2);
    expect(inboxRows(state, { ...all, query: 'Festival Horizonte' })).toEqual([]);
    const linked = linkInboxSource(state, source.id, 'festival', 'link-festival');
    expect(
      inboxRows(linked.state, { ...all, query: 'Festival Horizonte' }).map((row) => row.id)
    ).toEqual([source.id]);
    expect(inboxRows(state, { ...all, query: 'Source unavailable' })).toEqual([]);
  });
});

describe('explicit source-to-item associations', () => {
  it('links one source to multiple actual items while preserving all captured material and source targets', () => {
    const state = createInboxState();
    const source = state.capture.items[0];
    if (!source) throw new Error('Missing source fixture');
    const before = structuredClone(state);
    const first = linkInboxSource(state, source.id, 'walk', 'association-1');
    const second = linkInboxSource(first.state, source.id, 'friends', 'association-2');
    expect(second.error).toBeNull();
    expect(inboxSourceRow(second.state, source.id)?.validAssociationCount).toBe(2);
    expect(second.state.capture).toBe(state.capture);
    expect(second.state.targets).toBe(state.targets);
    expect(second.state.routeOrder).toBe(state.routeOrder);
    expect(state).toEqual(before);
    expect(linkInboxSource(second.state, source.id, 'walk', 'another').state).toBe(second.state);
  });

  it.each([
    ['removed-source', 'walk', 'new-association'],
    ['capture-recife-note', 'removed-target', 'new-association'],
    ['capture-recife-note', 'walk', ''],
    ['capture-recife-note', 'walk', 'organised-walk'],
  ] as const)(
    'rejects invalid selected endpoints or association ID %s %s %s',
    (sourceId, targetId, id) => {
      const state = createInboxState('organised');
      const result = linkInboxSource(state, sourceId, targetId, id);
      expect(result.state).toBe(state);
      expect(result.error).not.toBeNull();
    }
  );

  it('retains and removes stale endpoints explicitly without substituting source or target records', () => {
    const state = createInboxState('missing-reference');
    const source = inboxSourceRow(state, 'capture-recife-note');
    const orphan = inboxSourceRow(state, 'removed-source');
    expect(source).toMatchObject({ organised: false, validAssociationCount: 0 });
    expect(source?.findings).toContainEqual({
      id: 'missing-target',
      message: 'The linked item is unavailable.',
    });
    expect(orphan?.source).toBeUndefined();
    expect(orphan?.validAssociationCount).toBe(0);
    expect(inboxRows(state, { ...all, organisation: 'unorganised' })).toHaveLength(3);
    const removed = unlinkInboxAssociation(state, 'missing-source');
    expect(inboxSourceRow(removed, 'removed-source')).toBeNull();
    expect(removed.targets).toBe(state.targets);
    expect(unlinkInboxAssociation(state, 'unknown')).toBe(state);
    expect(inboxRows(state, { ...all, query: 'Item unavailable' })).toEqual([]);
  });

  it('exposes source and linked target stale visit references without replacing them from labels', () => {
    const state = createInboxState();
    const source = state.capture.items[0];
    const target = state.targets.find((entry) => entry.id === 'walk');
    if (!source || !target) throw new Error('Missing source and target fixtures');
    source.visitId = 'missing-source-visit';
    target.visitId = 'missing-target-visit';
    const linked = linkInboxSource(state, source.id, target.id, 'visit-link');
    expect(inboxSourceRow(linked.state, source.id)?.findings.map((finding) => finding.id)).toEqual([
      'missing-source-visit',
      'visit-visit-link',
    ]);
    expect(source.visitId).toBe('missing-source-visit');
    const draft = {
      ...linked.state,
      capture: {
        ...linked.state.capture,
        draft: { ...linked.state.capture.draft, text: 'Source' },
      },
    };
    expect(captureInboxItem(draft, 'new-source').error).toBeNull();
  });
});
