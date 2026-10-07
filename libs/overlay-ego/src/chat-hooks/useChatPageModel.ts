/**
 * View model hook for the ChatPage.
 *
 * Composed from focused sub-hooks to keep each function concise.
 */
import { useCallback, useState } from 'react';

import { useChatMutations } from './useChatMutations';
import { useConversationDetail } from './useConversationDetail';
import { useConversationList } from './useConversationList';

import type { ChatPageModel } from './types';

/** Build the conversation state shared by the full-page and shell-overlay chat. */
export function useChatPageModel(): ChatPageModel {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const list = useConversationList();
  const detail = useConversationDetail(selectedConversationId);
  const mutations = useChatMutations({
    selectedConversationId,
    setSelectedConversationId,
    inputValue,
    messages: detail.messages,
    setInputValue,
  });

  const selectConversation = useCallback(
    (id: string) => {
      mutations.clearPendingUserMessage();
      setSelectedConversationId(id);
      mutations.clearEngrams();
    },
    [mutations]
  );

  const startNewConversation = useCallback(() => {
    mutations.clearPendingUserMessage();
    setSelectedConversationId(null);
    setInputValue('');
    mutations.clearEngrams();
  }, [mutations]);

  return {
    conversations: list.conversations,
    conversationsLoading: list.isLoading,
    selectedConversationId,
    selectConversation,
    messages: detail.messages,
    pendingUserMessage: mutations.pendingUserMessage,
    messagesLoading: detail.isLoading,
    inputValue,
    setInputValue,
    sendMessage: mutations.sendMessage,
    batchDecisions: mutations.batchDecisions,
    isSending: mutations.isSending,
    sendError: mutations.sendError,
    startNewConversation,
    deleteConversation: mutations.deleteConversation,
    isDeleting: mutations.isDeleting,
    searchQuery: list.searchQuery,
    setSearchQuery: list.setSearchQuery,
    activeScopes: detail.activeScopes,
    retrievedEngrams: mutations.retrievedEngrams,
    streamingContent: mutations.streamingContent,
    persistedMessageId: mutations.persistedMessageId,
    toolActivity: mutations.toolActivity,
    streamParts: mutations.streamParts,
  };
}
