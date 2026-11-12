import { expect, it } from 'vitest';

import { addCraftItem, openCraftPanel, resumeCraftDraft, undoCraftItem } from './transitions';

import type { ComposerContext, ComposerDraft, CraftPreviewState } from './model';

function initialState(): CraftPreviewState {
  return {
    panel: null,
    showIdeas: true,
    draft: null,
    savedDrafts: [],
    items: [],
    lastAdded: null,
    calendarOpen: false,
  };
}

function enter(state: CraftPreviewState, text: string): CraftPreviewState {
  if (!state.draft) throw new Error('Expected an active composer.');
  return { ...state, draft: { ...state.draft, text } };
}

function snapshot(id: string, context: ComposerContext, text: string): ComposerDraft {
  return { id, context, text };
}

const thoughtContext: ComposerContext = { kind: 'capture' };
const stayContext: ComposerContext = {
  kind: 'stay',
  visitId: 'craft-recife',
  gap: {
    kind: 'accommodation-gap',
    id: 'craft-recife-nights',
    start: '2028-01-03',
    end: '2028-01-06',
  },
};

it('retains A and B after Undo A then opening C, including exact same-context versions', () => {
  const textA = '  First thought\nwith spaces  ';
  const textB = '  Newer thought\nkept too  ';
  const textC = '  A stay idea  ';
  let state = enter(openCraftPanel(initialState(), thoughtContext, 'draft-a'), textA);
  state = addCraftItem(state, 'item-a');
  state = enter(openCraftPanel(state, thoughtContext, 'draft-b'), textB);
  state = undoCraftItem(state);
  expect(state.draft).toEqual(snapshot('draft-b', thoughtContext, textB));
  expect(state.items).toEqual([]);
  state = enter(openCraftPanel(state, stayContext, 'draft-c'), textC);
  expect(state.savedDrafts).toEqual([
    snapshot('draft-a', thoughtContext, textA),
    snapshot('draft-b', thoughtContext, textB),
  ]);
  state = openCraftPanel(state, thoughtContext, 'must-not-replace-b');
  expect(state.draft).toEqual(snapshot('draft-b', thoughtContext, textB));
  state = resumeCraftDraft(state, 'draft-a');
  expect(state.draft).toEqual(snapshot('draft-a', thoughtContext, textA));
  state = resumeCraftDraft(state, 'draft-b');
  expect(state.draft).toEqual(snapshot('draft-b', thoughtContext, textB));
  state = openCraftPanel(state, stayContext, 'must-not-replace-c');
  expect(state.draft).toEqual(snapshot('draft-c', stayContext, textC));
  expect(state.panel).toEqual(stayContext);
  expect(state.savedDrafts.map(({ id }) => id)).toEqual(['draft-a', 'draft-b']);
});

it('restores a submitted stay composer and preserves its exact gap without claiming coverage', () => {
  const text = '  Courtyard room\nplease  ';
  let state = enter(openCraftPanel(initialState(), stayContext, 'stay-draft'), text);
  state = addCraftItem(state, 'stay-item');
  expect(state.items).toEqual([
    {
      visitId: 'craft-recife',
      item: {
        kind: 'stay',
        id: 'stay-item',
        title: text.trim(),
        checkIn: '2028-01-03',
        checkOut: '2028-01-06',
        state: 'Considering',
      },
    },
  ]);
  state = undoCraftItem(state);
  expect(state.items).toEqual([]);
  expect(state.lastAdded).toBeNull();
  expect(state.panel).toEqual(stayContext);
  expect(state.draft).toEqual(snapshot('stay-draft', stayContext, text));
  expect(undoCraftItem(state)).toBe(state);
});

it('retains every nonempty draft across repeated context changes and explicit recovery', () => {
  let state = initialState();
  const expected = Array.from({ length: 20 }, (_, index) => ({
    id: `draft-${index}`,
    context: { kind: 'capture', visitId: `visit-${index}` },
    text: `  draft ${index}\n  `,
  }));
  for (const [index, snapshot] of expected.entries()) {
    const context: ComposerContext = { kind: 'capture', visitId: `visit-${index}` };
    state = enter(openCraftPanel(state, context, snapshot.id), snapshot.text);
  }
  expect([...state.savedDrafts, state.draft]).toEqual(expected);
  for (const snapshot of expected) {
    state = resumeCraftDraft(state, snapshot.id);
    expect(state.draft).toEqual(snapshot);
    expect(state.savedDrafts).toHaveLength(expected.length - 1);
  }
  expect(resumeCraftDraft(state, 'unknown-snapshot')).toBe(state);
});
