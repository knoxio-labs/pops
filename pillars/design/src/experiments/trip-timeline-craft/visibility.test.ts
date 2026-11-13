import { craftTimeline, sparseCraftTimeline } from '@/fixtures/trip-timeline-craft';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { CraftDateSummary } from './header';
import { visibleCraftRows } from './model';

it('uses the same idea-free ordered rows for Timeline and date summary', () => {
  const visible = visibleCraftRows(craftTimeline.rows, false);
  expect(visible.map(({ id }) => id)).toEqual([
    'craft-porto-alegre',
    'craft-flight-recife',
    'craft-recife',
    'craft-rio',
  ]);
  expect(visible.some(({ id }) => id === 'craft-flight-rio')).toBe(false);
  expect(visibleCraftRows(craftTimeline.rows, true)).toEqual(craftTimeline.rows);
});

it('keeps unknown booking state and incomplete Visit dates visible without changing source data', () => {
  const visible = visibleCraftRows(sparseCraftTimeline.rows, false);
  expect(visible).toEqual(sparseCraftTimeline.rows);
  expect(visible[0]).toBe(sparseCraftTimeline.rows[0]);
});

it('renders the actual date summary without hidden Considering route titles or dates', () => {
  const shown = renderToStaticMarkup(
    createElement(CraftDateSummary, { timeline: craftTimeline, showIdeas: true })
  );
  const hidden = renderToStaticMarkup(
    createElement(CraftDateSummary, { timeline: craftTimeline, showIdeas: false })
  );
  expect(shown).toContain('Recife → Rio de Janeiro');
  expect(shown).toContain('6 Jan → Not set');
  expect(hidden).not.toContain('Recife → Rio de Janeiro');
  expect(hidden).not.toContain('6 Jan → Not set');
  expect(hidden).toContain('Porto Alegre → Recife');
  expect(hidden).toContain('Recife / Olinda');
});

it('renders unknown and date-only sources through the actual date summary when ideas are hidden', () => {
  const markup = renderToStaticMarkup(
    createElement(CraftDateSummary, { timeline: sparseCraftTimeline, showIdeas: false })
  );
  expect(markup).toContain('Porto Alegre → Recife');
  expect(markup).toContain('29 Dec → Not set');
  expect(markup).toContain('Recife / Olinda');
  expect(markup).toContain('Rio de Janeiro');
  expect(markup).toContain('Not set → Not set');
});
