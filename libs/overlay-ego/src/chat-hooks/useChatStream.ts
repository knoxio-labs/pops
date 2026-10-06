import { useCallback, useMemo } from 'react';

import { findContinuableBatchId } from './continuableBatch';
import { useBatchDecision } from './useBatchDecision';

import type { QueryClient } from '@tanstack/react-query';

import type { EgoGetConversationResponses } from '../ego-api/types.gen';
import type { ChatMessage, RetrievedEngram } from './types';
import type { UseStreamingChatReturn } from './useStreamingChat';

type ConversationDetail = EgoGetConversationResponses[200];
type Stream = UseStreamingChatReturn['stream'];
type StreamCallbacks = Parameters<Stream>[1];

interface StreamCallbackParams {
  onNavigate: (uri: string) => void;
  queryClient: QueryClient;
  setRetrievedEngrams: (engrams: RetrievedEngram[]) => void;
  setSelectedConversationId: (id: string | null) => void;
  clearPendingUserMessage: () => void;
}

/** Memoize one stream callback set for both message and resume entry points. */
export function useStreamCallbacks({
  onNavigate,
  queryClient,
  setRetrievedEngrams,
  setSelectedConversationId,
  clearPendingUserMessage,
}: StreamCallbackParams): StreamCallbacks {
  return useMemo(
    () => ({
      onConversation: setSelectedConversationId,
      onEngrams: setRetrievedEngrams,
      onNavigate,
      onInvalidate: async (conversationId: string) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['ego', 'conversations', 'list'] }),
          queryClient.invalidateQueries({
            queryKey: ['ego', 'conversations', 'get', { id: conversationId }],
          }),
        ]);
        clearPendingUserMessage();
      },
    }),
    [
      clearPendingUserMessage,
      onNavigate,
      queryClient,
      setRetrievedEngrams,
      setSelectedConversationId,
    ]
  );
}

interface BatchDecisionStreamParams {
  conversationId: string | null;
  stream: Stream;
  callbacks: StreamCallbacks;
  messages: ChatMessage[];
  isStreaming: boolean;
}

/** Record a decision, then continue its conversation through the shared stream. */
export function useBatchDecisionStream({
  conversationId,
  stream,
  callbacks,
  messages,
  isStreaming,
}: BatchDecisionStreamParams) {
  const onDecided = useCallback(
    (batchId: string) => {
      if (conversationId !== null) {
        stream({ conversationId, resumeBatchId: batchId }, callbacks);
      }
    },
    [callbacks, conversationId, stream]
  );
  const batchDecision = useBatchDecision(conversationId, onDecided);
  const continuableBatchId =
    batchDecision.decidingBatchId === null ? findContinuableBatchId(messages) : null;
  const continueBatch = useCallback(
    (batchId: string) => {
      if (
        conversationId === null ||
        isStreaming ||
        batchDecision.decidingBatchId !== null ||
        batchId !== continuableBatchId
      ) {
        return;
      }
      stream({ conversationId, resumeBatchId: batchId }, callbacks);
    },
    [
      batchDecision.decidingBatchId,
      callbacks,
      continuableBatchId,
      conversationId,
      isStreaming,
      stream,
    ]
  );

  return { ...batchDecision, continuableBatchId, continueBatch };
}

interface SendMessageParams {
  batchDecidingId: string | null;
  callbacks: StreamCallbacks;
  inputValue: string;
  isStreaming: boolean;
  queryClient: QueryClient;
  selectedConversationId: string | null;
  setPendingUserMessage: (message: string | null) => void;
  setInputValue: (value: string) => void;
  stream: Stream;
}

/** Send one message unless a stream or batch decision currently owns the hook. */
export function useSendMessage({
  batchDecidingId,
  callbacks,
  inputValue,
  isStreaming,
  queryClient,
  selectedConversationId,
  setPendingUserMessage,
  setInputValue,
  stream,
}: SendMessageParams) {
  return useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming || batchDecidingId !== null) return;

    setInputValue('');
    if (selectedConversationId !== null) {
      setPendingUserMessage(null);
      const message = buildOptimisticMessage(selectedConversationId, trimmed);
      queryClient.setQueryData<ConversationDetail>(
        ['ego', 'conversations', 'get', { id: selectedConversationId }],
        (previous) =>
          previous ? { ...previous, messages: [...previous.messages, message] } : previous
      );
    } else {
      setPendingUserMessage(trimmed);
    }
    stream({ conversationId: selectedConversationId, message: trimmed }, callbacks);
  }, [
    batchDecidingId,
    callbacks,
    inputValue,
    isStreaming,
    queryClient,
    selectedConversationId,
    setPendingUserMessage,
    setInputValue,
    stream,
  ]);
}

function buildOptimisticMessage(conversationId: string, content: string) {
  return {
    id: `optimistic_${Date.now()}`,
    conversationId,
    role: 'user',
    content,
    citations: null,
    toolCalls: null,
    parts: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: new Date().toISOString(),
  };
}
