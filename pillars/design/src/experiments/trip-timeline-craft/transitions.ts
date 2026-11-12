import type { CraftStay, CraftThought } from '@/fixtures/trip-timeline-craft';

import type { ComposerContext, ComposerDraft, CraftPanel, CraftPreviewState } from './model';

function sameComposerContext(left: ComposerContext, right: ComposerContext) {
  if (left.kind === 'capture' && right.kind === 'capture') return left.visitId === right.visitId;
  return (
    left.kind === 'stay' &&
    right.kind === 'stay' &&
    left.visitId === right.visitId &&
    left.gap.id === right.gap.id
  );
}

function retainedDrafts(saved: ComposerDraft[], draft: ComposerDraft | null) {
  return draft?.text ? [...saved, draft] : saved;
}

function activateDraft(
  state: CraftPreviewState,
  draft: ComposerDraft,
  saved: ComposerDraft[]
): CraftPreviewState {
  return {
    ...state,
    draft,
    panel: draft.context,
    savedDrafts: saved.filter(({ id }) => id !== draft.id),
  };
}

/** Opening a context resumes its active or most recently retained draft; other snapshots remain intact. */
export function openCraftPanel(
  state: CraftPreviewState,
  next: CraftPanel,
  draftId: string
): CraftPreviewState {
  if (next.kind !== 'capture' && next.kind !== 'stay') return { ...state, panel: next };
  if (state.draft && sameComposerContext(state.draft.context, next)) {
    return { ...state, panel: state.draft.context };
  }
  const saved = retainedDrafts(state.savedDrafts, state.draft);
  const existing = saved.toReversed().find((draft) => sameComposerContext(draft.context, next));
  if (existing) return activateDraft(state, existing, saved);
  return activateDraft(state, { id: draftId, context: next, text: '' }, saved);
}

function localItem(context: ComposerContext, text: string, id: string): CraftThought | CraftStay {
  if (context.kind === 'capture') return { kind: 'thought', id, title: text.trim() };
  return {
    kind: 'stay',
    id,
    title: text.trim(),
    checkIn: context.gap.start,
    checkOut: context.gap.end,
    state: 'Considering',
  };
}

/** Submit only the current matching draft and retain its original text/context for local Undo. */
export function addCraftItem(state: CraftPreviewState, id: string): CraftPreviewState {
  const { draft, panel } = state;
  if (!draft || !draft.text.trim() || !panel) return state;
  if (panel.kind !== 'capture' && panel.kind !== 'stay') return state;
  if (!sameComposerContext(draft.context, panel)) return state;
  const item = localItem(panel, draft.text, id);
  return {
    ...state,
    items: [...state.items, { visitId: panel.visitId, item }],
    showIdeas: true,
    lastAdded: { id, draft },
    draft: null,
    panel: null,
  };
}

/** Undo removes only its entry and restores the exact composer without overwriting newer text. */
export function undoCraftItem(state: CraftPreviewState): CraftPreviewState {
  const receipt = state.lastAdded;
  if (!receipt) return state;
  const remaining = {
    ...state,
    items: state.items.filter(({ item }) => item.id !== receipt.id),
    lastAdded: null,
  };
  if (state.draft?.text)
    return { ...remaining, savedDrafts: [...state.savedDrafts, receipt.draft] };
  return { ...remaining, draft: receipt.draft, panel: receipt.draft.context };
}

/** Resume one explicit snapshot identity and retain the current nonempty draft without replacing any other. */
export function resumeCraftDraft(state: CraftPreviewState, draftId: string): CraftPreviewState {
  const restored = state.savedDrafts.find(({ id }) => id === draftId);
  if (!restored) return state;
  return activateDraft(state, restored, retainedDrafts(state.savedDrafts, state.draft));
}
