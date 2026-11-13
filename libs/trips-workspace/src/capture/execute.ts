import { captureDraftHasMaterial, emptyCaptureDraft } from './draft';
import {
  alreadyUndoneCapture,
  captureRequestRejected,
  captureRevisionConflict,
  occupiedCaptureComposer,
} from './failure';
import { applyCaptureResult, requireCaptureResult } from './result';

import type { CaptureEditorStore } from './editor-store';
import type { CaptureIntent } from './editor-types';
import type { CaptureResult } from './types';

function confirmed(
  store: CaptureEditorStore,
  intent: CaptureIntent,
  result: CaptureResult
): boolean {
  const source = applyCaptureResult(store.state.source, result, intent.inverse);
  store.pending = null;
  const retainedFailure = store.recovery.restoreConflict();
  if (result.undone) {
    store.publish({
      source,
      generation: store.state.generation + 1,
      busy: false,
      composerLocked: false,
      failure: retainedFailure ?? {
        label: intent.label,
        error: alreadyUndoneCapture(),
        canRetry: false,
      },
      confirmation: { request: intent.request, result },
    });
    return false;
  }
  let draft = store.state.draft;
  let draftRevision = store.state.draftRevision;
  if (intent.inverse !== null) {
    store.history = store.history.filter(
      (entry) => entry.operation.operationId !== intent.inverse?.operation.operationId
    );
    if (intent.inverse.draft !== null) {
      draft = store.selections.restore(intent.inverse.draft);
      draftRevision += 1;
    }
  } else if (intent.request.command.kind !== 'undo') {
    store.history.push({
      operation: { operationId: intent.request.operationId, command: intent.request.command },
      receipt: result.receipt,
      draft: intent.draft,
    });
    if (intent.draft !== null && intent.draftRevision === draftRevision) {
      draft = { ...emptyCaptureDraft(), explore: draft.explore };
      draftRevision += 1;
    }
  }
  store.publish({
    source,
    draft,
    draftRevision,
    generation: store.state.generation + 1,
    busy: false,
    composerLocked: false,
    failure: retainedFailure,
    confirmation: { request: intent.request, result },
  });
  return true;
}
/** Run one immutable request; pending Undo reserves the composer before crossing the network boundary. */
export async function executeCaptureIntent(
  store: CaptureEditorStore,
  intent: CaptureIntent
): Promise<boolean> {
  if (store.state.busy || (store.pending !== null && store.pending !== intent)) return false;
  if (intent.inverse?.draft && captureDraftHasMaterial(store.state.draft)) {
    store.failureIntent = intent;
    store.publish({
      failure: { error: occupiedCaptureComposer(), label: intent.label, canRetry: true },
    });
    return false;
  }
  const restoresDraft = intent.inverse !== null && intent.inverse.draft !== null;
  store.pending = intent;
  store.publish({ busy: true, composerLocked: restoresDraft, failure: null });
  try {
    const result = await store.perform(intent.request);
    requireCaptureResult(result, intent.request, store.tripId);
    const success = confirmed(store, intent, result);
    store.flush();
    return success;
  } catch (error) {
    store.pending = captureRequestRejected(error) ? null : intent;
    store.failureIntent = intent;
    const conflict = captureRevisionConflict(error, intent);
    const failure = {
      label: intent.label,
      error,
      canRetry: !conflict,
      reloadSource: conflict,
    };
    store.recovery.retainConflict(intent, failure);
    store.publish({
      busy: false,
      composerLocked: store.pending !== null && restoresDraft,
      failure,
    });
    store.flush();
    return false;
  }
}
