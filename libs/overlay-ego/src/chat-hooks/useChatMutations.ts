/**
 * Sub-hook: chat mutations (SSE streaming) and delete.
 *
 * The streaming path uses the SSE endpoint for token-by-token rendering.
 * The non-streaming tRPC ego.chat mutation remains for MCP/CLI channels.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { egoDeleteConversation } from '../ego-api';
import { unwrap } from '../ego-api-helpers';
import { useBatchDecisionStream, useSendMessage, useStreamCallbacks } from './useChatStream';
import { useFrameNavigation } from './useFrameNavigation';
import { useStreamingChat } from './useStreamingChat';

import type { RetrievedEngram } from './types';

interface UseChatMutationsParams {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
}

function useDeleteConversation(
  selectedConversationId: string | null,
  setSelectedConversationId: (id: string | null) => void,
  setRetrievedEngrams: (e: RetrievedEngram[]) => void,
  queryClient: QueryClient
) {
  const mutation = useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      unwrap(await egoDeleteConversation({ path: { id } })),
    onSuccess: (_data, variables) => {
      if (selectedConversationId === variables.id) {
        setSelectedConversationId(null);
        setRetrievedEngrams([]);
      }
      void queryClient.invalidateQueries({ queryKey: ['ego', 'conversations', 'list'] });
    },
  });
  const deleteConversation = useCallback((id: string) => mutation.mutate({ id }), [mutation]);
  return { deleteConversation, isDeleting: mutation.isPending };
}

export function useChatMutations({
  selectedConversationId,
  setSelectedConversationId,
  inputValue,
  setInputValue,
}: UseChatMutationsParams) {
  const [retrievedEngrams, setRetrievedEngrams] = useState<RetrievedEngram[]>([]);
  const queryClient = useQueryClient();
  const streaming = useStreamingChat();
  const onNavigate = useFrameNavigation();
  const streamCallbacks = useStreamCallbacks({
    onNavigate,
    queryClient,
    setRetrievedEngrams,
    setSelectedConversationId,
  });
  const batchDecisions = useBatchDecisionStream(
    selectedConversationId,
    streaming.stream,
    streamCallbacks
  );
  const { deleteConversation, isDeleting } = useDeleteConversation(
    selectedConversationId,
    setSelectedConversationId,
    setRetrievedEngrams,
    queryClient
  );

  const sendMessage = useSendMessage({
    batchDecidingId: batchDecisions.decidingBatchId,
    callbacks: streamCallbacks,
    inputValue,
    isStreaming: streaming.isStreaming,
    queryClient,
    selectedConversationId,
    setInputValue,
    stream: streaming.stream,
  });

  const clearEngrams = useCallback(() => setRetrievedEngrams([]), []);

  return {
    sendMessage,
    isSending: streaming.isStreaming,
    sendError: streaming.error,
    deleteConversation,
    isDeleting,
    retrievedEngrams,
    clearEngrams,
    streamingContent: streaming.streamingContent,
    toolActivity: streaming.toolActivity,
    streamParts: streaming.streamParts,
    batchDecisions: streaming.isStreaming ? null : batchDecisions,
  };
}
