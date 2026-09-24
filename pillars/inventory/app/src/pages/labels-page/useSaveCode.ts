/**
 * Giving an item its code before its label prints, through the command
 * layer's `item.setCode` (ADR-002 D7). A printed code is never changed
 * afterwards, so the save happens first and the label only prints once the
 * server holds it. A code another item holds comes back as a
 * `code_collision` conflict naming the holder and the next free code.
 */
import { useQueryClient } from '@tanstack/react-query';

import { useInventoryMutation } from '../../inventory-web/useInventoryMutation.js';
import { CODE_SUGGESTION_QUERY_KEY } from './useLabelSubjects';

import type { InventoryMutationOutcome } from '../../inventory-web/mutation-client.js';
import type { LabelSubject } from './useLabelSubjects';

/** What saving a code came to. */
export type CodeSaveResult =
  | { status: 'saved' }
  | { status: 'taken'; holder: string; suggestion: string | null }
  | { status: 'failed'; message: string };

/** Maps a mutation outcome onto what the code field shows. */
export function codeSaveResult(outcome: InventoryMutationOutcome): CodeSaveResult {
  if (outcome.status === 'applied') return { status: 'saved' };
  if (outcome.status === 'conflict' && outcome.kind === 'code_collision') {
    return { status: 'taken', holder: outcome.heldBy.name, suggestion: outcome.suggestedCode };
  }
  if (outcome.status === 'rejected') return { status: 'failed', message: outcome.message };
  if (outcome.status === 'conflict' && outcome.kind === 'field') {
    return { status: 'failed', message: 'The item changed while you were here. Try again.' };
  }
  return { status: 'failed', message: 'The code was not saved. Try again.' };
}

/** A function that saves one item's code, and whether a save is under way. */
export function useSaveCode() {
  const mutation = useInventoryMutation();
  const queryClient = useQueryClient();
  const save = async (subject: LabelSubject, code: string): Promise<CodeSaveResult> => {
    try {
      const outcome = await mutation.mutateAsync({
        command: { op: 'item.setCode', args: { code } },
        entityId: subject.id,
        baseRevision: subject.revision,
      });
      const result = codeSaveResult(outcome);
      if (result.status === 'saved') {
        void queryClient.invalidateQueries({ queryKey: CODE_SUGGESTION_QUERY_KEY });
      }
      return result;
    } catch (error) {
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'The code was not saved.',
      };
    }
  };
  return { save, isSaving: mutation.isPending };
}

/**
 * Saves the suggested code, and when another item took it in the meantime
 * (two boxes suggested the same next number), the next free code the
 * server offers instead.
 */
export async function saveSuggestedCode(
  save: (subject: LabelSubject, code: string) => Promise<CodeSaveResult>,
  subject: LabelSubject,
  suggestion: string
): Promise<CodeSaveResult> {
  const first = await save(subject, suggestion);
  if (first.status !== 'taken' || first.suggestion === null) return first;
  return save(subject, first.suggestion);
}
