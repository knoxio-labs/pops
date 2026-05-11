/**
 * tRPC mutation wrappers for the Query view model.
 *
 * Centralises the success/error handling for `cerebrum.query.ask` and
 * `cerebrum.emit.generate`. Split out of `useQueryPageModel` so each
 * surface stays within the line/complexity caps.
 */
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { extractMessage } from '../utils/errors';

import type { ValidatedQueryRequest } from './form-mapping';
import type { QueryAnswer, QueryHistoryEntry } from './types';

export interface AskInvocation {
  request: ValidatedQueryRequest;
  historyId: string;
}

export interface SaveDocumentRequest {
  mode: 'report';
  query: string;
  scopes?: string[];
  includeSecret?: boolean;
}

export interface AskBindings {
  pending: AskInvocation | null;
  setAnswer: (next: QueryAnswer | null) => void;
  setError: (next: string | null) => void;
  updateStats: (id: string, result: QueryAnswer) => void;
  unknownErrorMessage: string;
}

export function entryToRequest(entry: QueryHistoryEntry): ValidatedQueryRequest {
  return {
    question: entry.question,
    ...(entry.scopes.length > 0 ? { scopes: entry.scopes } : {}),
    ...(entry.domains.length > 0 ? { domains: entry.domains } : {}),
    ...(entry.includeSecret ? { includeSecret: true } : {}),
  };
}

export function buildSaveRequest(request: ValidatedQueryRequest): SaveDocumentRequest {
  return {
    mode: 'report',
    query: request.question,
    ...(request.scopes && request.scopes.length > 0 ? { scopes: request.scopes } : {}),
    ...(request.includeSecret ? { includeSecret: true } : {}),
  };
}

export function useAskMutation(bindings: AskBindings) {
  return trpc.cerebrum.query.ask.useMutation({
    onSuccess: (result: QueryAnswer | undefined) => {
      if (!result) {
        bindings.setError(bindings.unknownErrorMessage);
        return;
      }
      bindings.setAnswer(result);
      bindings.setError(null);
      if (bindings.pending) bindings.updateStats(bindings.pending.historyId, result);
    },
    onError: (err: unknown) => {
      const message = extractMessage(err, bindings.unknownErrorMessage);
      bindings.setError(message);
      toast.error(message);
    },
  });
}

interface SaveResult {
  document?: { title?: string } | null;
  notice?: string;
}

export function useSaveDocumentMutation(unknownErrorMessage: string) {
  const { t } = useTranslation('cerebrum');
  return trpc.cerebrum.emit.generate.useMutation({
    onSuccess: (result: SaveResult | undefined) => {
      const title = result?.document?.title;
      if (title) {
        toast.success(t('query.saveDocument.success', { title }));
        return;
      }
      toast.success(result?.notice ?? t('query.saveDocument.empty'));
    },
    onError: (err: unknown) => toast.error(extractMessage(err, unknownErrorMessage)),
  });
}
