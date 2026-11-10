import { useState } from 'react';

import { personDraft } from './draft';
import { personChanges } from './draft-changes';

import type { PersonSnapshot } from './contracts';
import type { PersonDraft } from './draft';
import type { usePerson } from './usePerson';

/** Keep every pending edit bound to its original snapshot, and undo drafts before this editor's committed receipts. */
export function usePersonDraft(data: PersonSnapshot, model: ReturnType<typeof usePerson>) {
  const [history, setHistory] = useState<Array<{ draft: PersonDraft; before: PersonSnapshot }>>([]);
  const pending = history.at(-1);
  const draft = pending?.draft ?? personDraft(data);
  const outdated = pending !== undefined && pending.before.version !== data.version;
  const dirty = personChanges(data, draft).length > 0;
  const valid = validDraft(draft);
  const disabled = model.saving || model.isFetching || model.isError || model.uncertain;
  async function save() {
    if (await model.save(draft, pending?.before ?? data)) setHistory([]);
  }
  function change(next: PersonDraft) {
    setHistory([...history, { draft: next, before: pending?.before ?? data }]);
  }
  function undo() {
    if (history.length > 0) setHistory(history.slice(0, -1));
    else void model.undo();
  }
  return {
    draft,
    disabled,
    outdated,
    change,
    save,
    undo,
    discard: () => setHistory([]),
    saveDisabled: disabled || outdated || !dirty || !valid,
    undoDisabled: disabled || (history.length === 0 && !model.canUndo),
  };
}

function validDraft(draft: PersonDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    draft.points.every((point) => point.value.trim()) &&
    draft.addresses.every((address) => address.value.trim())
  );
}
