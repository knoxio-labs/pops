import { useState } from 'react';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { createContactPickerState } from './fixture';
import { createAndLinkContact, linkPickerContact, unlinkPickerContact } from './model';

import type { ContactDraft } from '../contact-editor/model';
import type { PickerScenario } from './model';

function emptyDraft(name = ''): ContactDraft {
  return { name, kind: '', aliases: [], notes: '', methods: [], addresses: [] };
}

/** Keeps task and unsaved contact drafts independent of reversible contact/link history and picker visibility. */
export function useContactPicker(scenario: PickerScenario) {
  const [initial] = useState(() => createContactPickerState(scenario));
  const history = useRouteState(() => initial);
  const [task, setTask] = useState(initial.task);
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(() => emptyDraft());
  const [error, setError] = useState<string | null>(null);
  return {
    state: history.state,
    task,
    setTask,
    open,
    setOpen,
    query,
    setQuery,
    kind,
    setKind,
    creating,
    draft,
    setDraft,
    error,
    canUndo: history.canUndo,
    undo: history.undo,
    toggle: (id: string) =>
      history.change(
        history.state.linkedIds.includes(id)
          ? unlinkPickerContact(history.state, id)
          : linkPickerContact(history.state, id)
      ),
    unlink: (id: string) => history.change(unlinkPickerContact(history.state, id)),
    startCreation: () => {
      setDraft(emptyDraft(query));
      setError(null);
      setCreating(true);
    },
    cancelCreation: () => {
      setDraft(emptyDraft());
      setError(null);
      setCreating(false);
    },
    create: () => {
      const result = createAndLinkContact(history.state, draft, crypto.randomUUID());
      setError(result.error);
      if (result.error) return;
      history.change(result.state);
      setDraft(emptyDraft());
      setCreating(false);
    },
  };
}

/** Shared controlled session passed through inline and dialog projections. */
export type PickerSession = ReturnType<typeof useContactPicker>;
