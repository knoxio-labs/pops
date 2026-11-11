import { useMutation } from '@tanstack/react-query';

import { useSessionView } from '../shared/use-session-view';
import { unlinkPaperlessDocument } from './api';

import type { MutateOptions, QueryKey, UseMutationResult } from '@tanstack/react-query';

import type { RetainedSourceOwner, SourceSessionView } from '../shared/retained-session-store';
import type { SourceQuery } from '../shared/use-source-query';

interface UnlinkIntent {
  readonly associationId: number;
  readonly owner: RetainedSourceOwner;
  readonly queryKey: QueryKey;
  readonly view: SourceSessionView;
}
type UnlinkOptions = MutateOptions<void, Error, number, unknown>;

/** Keep each association unlink's owner through asynchronous mutation preparation and settlement, preserving the ID-based API. */
export function useDocumentUnlink(
  query: Pick<SourceQuery<unknown>, 'owner' | 'queryKey'>
): UseMutationResult<void, Error, number, unknown> {
  const view = useSessionView(query.owner);
  const mutation = useMutation<void, Error, UnlinkIntent, unknown>({
    meta: { errorHandled: true },
    mutationFn: (intent) => {
      intent.view.assertCurrent();
      return unlinkPaperlessDocument(
        intent.owner.tripId,
        intent.associationId,
        intent.owner.client
      );
    },
    onSuccess: (_result, intent) =>
      intent.owner.scope.invalidateQueries({ queryKey: intent.queryKey }),
  });
  const capture = (associationId: number): UnlinkIntent =>
    Object.freeze({ associationId, owner: query.owner, queryKey: query.queryKey, view });
  const actions: Pick<UseMutationResult<void, Error, number, unknown>, 'mutate' | 'mutateAsync'> = {
    mutate: (associationId, options) => {
      if (view.isActive()) mutation.mutate(capture(associationId), unlinkOptions(options));
    },
    mutateAsync: async (associationId, options) => {
      view.assertCurrent();
      return mutation.mutateAsync(capture(associationId), unlinkOptions(options));
    },
  };
  if (mutation.isIdle) return { ...mutation, ...actions, variables: undefined };
  return { ...mutation, ...actions, variables: mutation.variables.associationId };
}

function unlinkOptions(
  options: UnlinkOptions | undefined
): MutateOptions<void, Error, UnlinkIntent, unknown> | undefined {
  if (options === undefined) return;
  return {
    onSuccess: (data, intent, result, context) =>
      options.onSuccess?.(data, intent.associationId, result, context),
    onError: (error, intent, result, context) =>
      options.onError?.(error, intent.associationId, result, context),
    onSettled: (...[data, error, intent, result, context]) =>
      options.onSettled?.(data, error, intent.associationId, result, context),
  };
}
