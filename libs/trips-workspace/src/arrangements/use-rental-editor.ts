import { RetainedSessionStore, assertSourceOwner } from '../shared/retained-session-store';
import { useRetainedSession } from '../shared/use-retained-session';
import { useSessionView } from '../shared/use-session-view';
import { useSourceEditor } from '../shared/useSourceEditor';
import { patchRental } from './api';
import { rentalActions } from './rental-actions';
import { rentalCacheKey } from './rental-cache';
import { RentalEditSession, ownedRental, rentalFields } from './RentalSession';

import type { RetainedSourceOwner } from '../shared/retained-session-store';
import type { RentalViewActions } from './rental-actions';
import type { RentalContext } from './rental-context';
import type { RentalFields } from './RentalSession';
import type { Rental, RentalPatch } from './types';

const sessions = new RetainedSessionStore<RentalEditSession>();
/** Confirmed source, retained draft and exact retry intent for one canonical Rental identity. */
export interface RentalEditorState extends RentalViewActions {
  confirmed: Rental;
  draft: RentalFields;
  failure: { error: unknown; body: RentalPatch } | undefined;
  inverse: RentalFields | undefined;
  busy: boolean;
  dirty: boolean;
  changed: boolean;
}
/** Keep exact Rental CAS baselines, drafts and own Undo through source-view remounts without passive rebasing. */
export function useRentalEditor(
  identity: RentalContext,
  source: Rental,
  saved: (rental: Rental) => void
): RentalEditorState {
  const { owner, session } = useRetainedSession(
    sessions,
    {
      client: identity.client,
      tripId: identity.tripId,
      kind: 'rental',
      sourceId: source.id,
    },
    (captured) => createRentalSession(captured, source)
  );
  const view = useSessionView(owner);
  const editor = useSourceEditor(source, session.context.options, session, view);
  const failure = editor.failure;
  const previous = session.getState().history.at(-1);
  return {
    confirmed: { ...editor.saved },
    draft: rentalFields(editor.draft),
    failure: failure
      ? {
          error: failure.error,
          body: {
            ...failure.patch,
            expectedRevision: session.context.retainedBaseline?.revision ?? editor.saved.revision,
          },
        }
      : undefined,
    inverse: editor.canUndo && previous ? rentalFields(previous) : undefined,
    busy: editor.busy,
    dirty: editor.dirty,
    changed: source.revision > editor.saved.revision,
    ...rentalActions({ source, session, view, editor, saved }),
  };
}
function createRentalSession(owner: RetainedSourceOwner, source: Rental): RentalEditSession {
  if (source.tripId !== owner.tripId || source.id !== owner.sourceId)
    throw new Error('Rental source does not match its owner');
  const session = new RentalEditSession(ownedRental(source), {
    source: rentalFields,
    acceptRead: (incoming, current) =>
      incoming.id === owner.sourceId &&
      incoming.tripId === owner.tripId &&
      incoming.revision >= current.revision,
    save: (patch, baseline) => saveRental(owner, patch, baseline),
    onSaved: (result) => {
      session.recordReceipt(result);
      refreshRental(owner, result);
    },
  });
  return session;
}
async function saveRental(
  owner: RetainedSourceOwner,
  patch: RentalFields,
  baseline: Rental
): Promise<Rental> {
  assertSourceOwner(owner);
  const result = await patchRental({ client: owner.client, tripId: owner.tripId }, owner.sourceId, {
    ...patch,
    expectedRevision: baseline.revision,
  });
  if (
    result.id !== owner.sourceId ||
    result.tripId !== owner.tripId ||
    result.revision !== baseline.revision + 1
  )
    throw new Error('Rental write receipt does not match its source');
  return ownedRental(result);
}
function refreshRental(owner: RetainedSourceOwner, result: Rental): void {
  if ((owner.client.getConfig().baseUrl ?? '') !== owner.origin) return;
  owner.scope.setQueryData<Rental>(rentalCacheKey(owner), (current) =>
    current && current.revision > result.revision ? current : { ...result }
  );
  void owner.scope.invalidateQueries({
    queryKey: ['trips', owner.origin, owner.tripId, 'rentals'],
  });
}
