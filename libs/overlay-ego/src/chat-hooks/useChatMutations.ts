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

import type { ChatMessage, RetrievedEngram } from './types';

interface UseChatMutationsParams {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  inputValue: string;
  /** Current messages for the selected conversation, used to find a resumable batch. */
  messages: ChatMessage[];
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

function usePendingUserMessage() {
  const [message, setMessage] = useState<string | null>(null);
  const clear = useCallback(() => setMessage(null), []);
  return { message, setMessage, clear };
}

export function useChatMutations({
  selectedConversationId,
  setSelectedConversationId,
  inputValue,
  messages,
  setInputValue,
}: UseChatMutationsParams) {
  const [retrievedEngrams, setRetrievedEngrams] = useState<RetrievedEngram[]>([]);
  const pendingUserMessage = usePendingUserMessage();
  const queryClient = useQueryClient();
  const streaming = useStreamingChat();
  const streamCallbacks = useStreamCallbacks({
    onNavigate: useFrameNavigation(),
    queryClient,
    setRetrievedEngrams,
    setSelectedConversationId,
    clearPendingUserMessage: pendingUserMessage.clear,
  });
  const batchDecisions = useBatchDecisionStream({
    conversationId: selectedConversationId,
    stream: streaming.stream,
    callbacks: streamCallbacks,
    messages,
    isStreaming: streaming.isStreaming,
  });
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
    setPendingUserMessage: pendingUserMessage.setMessage,
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
    pendingUserMessage: pendingUserMessage.message,
    clearPendingUserMessage: pendingUserMessage.clear,
    clearEngrams,
    streamingContent: streaming.streamingContent,
    persistedMessageId: streaming.persistedMessageId,
    toolActivity: streaming.toolActivity,
    streamParts: streaming.streamParts,
    batchDecisions: streaming.isStreaming ? null : batchDecisions,
  };
}
