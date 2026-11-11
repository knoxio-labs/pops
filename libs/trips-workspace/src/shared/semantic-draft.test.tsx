import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { SemanticDraft, useSemanticDraft } from './semantic-draft';

afterEach(cleanup);

it('adopts untouched canonical values, preserves incomplete text, and clears only explicit reset', () => {
  const draft = new SemanticDraft({ text: 'Original' });
  draft.receive({ text: 'Fresh' });
  expect(draft.read()).toEqual({ text: 'Fresh' });
  draft.set({ text: 'Incomplete input' });
  draft.receive({ text: 'Foreign source' });
  expect(draft.read()).toEqual({ text: 'Incomplete input' });
  draft.reset({ text: 'Explicit reload' });
  expect(draft.read()).toEqual({ text: 'Explicit reload' });
});

it("does not replay another view's unchanged canonical value after a shared buffer converges", () => {
  const draft = new SemanticDraft({ text: '' });
  const first = renderHook(({ canonical }) => useSemanticDraft(canonical, draft), {
    initialProps: { canonical: { text: '' } },
  });
  const second = renderHook(() => useSemanticDraft({ text: '' }, draft));
  act(() => first.result.current[1]({ text: 'Submitted' }));
  first.rerender({ canonical: { text: 'Submitted' } });
  expect(first.result.current[0]).toEqual({ text: 'Submitted' });
  expect(second.result.current[0]).toEqual({ text: 'Submitted' });
});

it('ignores stale view reads and setters after its owner is no longer current', () => {
  const draft = new SemanticDraft('Original');
  let current = true;
  const view = renderHook(({ canonical }) => useSemanticDraft(canonical, draft, () => current), {
    initialProps: { canonical: 'Original' },
  });
  current = false;
  view.rerender({ canonical: 'Other owner' });
  act(() => view.result.current[1]('Closed view'));
  expect(draft.read()).toBe('Original');
});
