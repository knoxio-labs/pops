import { useState } from 'react';

import { addCraftItem, openCraftPanel, resumeCraftDraft, undoCraftItem } from './transitions';

import type { CraftPanel, CraftPreviewState } from './model';

/** Local interaction state for the fictional preview, independent of production command protocols. */
export function useCraftWorkspace() {
  const [state, setState] = useState<CraftPreviewState>({
    panel: null,
    showIdeas: true,
    draft: null,
    savedDrafts: [],
    items: [],
    lastAdded: null,
    calendarOpen: false,
  });
  return {
    state,
    open: (panel: CraftPanel) => {
      const draftId = crypto.randomUUID();
      setState((current) => openCraftPanel(current, panel, draftId));
    },
    close: () => setState((current) => ({ ...current, panel: null })),
    setText: (text: string) =>
      setState((current) => {
        if (!current.draft) return current;
        return { ...current, draft: { ...current.draft, text } };
      }),
    add: () => {
      const id = crypto.randomUUID();
      setState((current) => addCraftItem(current, id));
    },
    undo: () => setState(undoCraftItem),
    resume: (draftId: string) => setState((current) => resumeCraftDraft(current, draftId)),
    toggleIdeas: () => setState((current) => ({ ...current, showIdeas: !current.showIdeas })),
    toggleDates: () => setState((current) => ({ ...current, calendarOpen: !current.calendarOpen })),
  };
}

/** The preview controller exposes only its local state and explicit UI actions. */
export type CraftWorkspace = ReturnType<typeof useCraftWorkspace>;
