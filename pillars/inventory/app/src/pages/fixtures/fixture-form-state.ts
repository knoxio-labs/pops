import { useState } from 'react';
import { toast } from 'sonner';

import { isFixtureKind } from './fixture-kinds.js';

import type { FixtureDraft, FixtureFormDialogProps } from './fixture-form-dialog.js';

function initialDraft(fixture: FixtureFormDialogProps['fixture']): FixtureDraft {
  let kind: FixtureDraft['kind'] = 'power';
  if (fixture !== undefined) kind = isFixtureKind(fixture.type) ? fixture.type : null;
  return {
    name: fixture?.name ?? '',
    kind,
    locationId: fixture?.locationId ?? '',
    notes: fixture?.notes ?? null,
  };
}

function missingField(draft: FixtureDraft): string | null {
  if (draft.name.trim() === '') return 'Name it first.';
  if (draft.kind === null) return 'Choose its kind.';
  if (draft.locationId === '') return 'Choose its room.';
  return null;
}

/** Manages fixture form draft validation and preserves input after save errors. */
export function useFixtureForm(props: FixtureFormDialogProps): {
  readonly draft: FixtureDraft;
  readonly missing: string | null;
  readonly saving: boolean;
  readonly updateDraft: (patch: Partial<FixtureDraft>) => void;
  readonly submit: () => Promise<void>;
} {
  const [draft, setDraft] = useState<FixtureDraft>(() => initialDraft(props.fixture));
  const [saving, setSaving] = useState(false);
  const missing = missingField(draft);
  const disabled = props.disabledReason !== undefined;
  const updateDraft = (patch: Partial<FixtureDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const submit = async (): Promise<void> => {
    if (missing !== null || disabled || saving) return;
    setSaving(true);
    try {
      await props.onSave({
        ...draft,
        name: draft.name.trim(),
        notes: draft.notes === null || draft.notes.trim() === '' ? null : draft.notes.trim(),
      });
      props.onOpenChange(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The fixture was not saved.');
    } finally {
      setSaving(false);
    }
  };
  return { draft, missing, saving, updateDraft, submit };
}
