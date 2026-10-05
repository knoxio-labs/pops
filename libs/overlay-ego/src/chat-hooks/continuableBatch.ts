import type { ChatMessage } from './types';

/**
 * Find the latest decided action batch that can still be continued from the last message.
 * A later message supersedes every earlier batch.
 */
export function findContinuableBatchId(messages: ChatMessage[]): string | null {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.parts === null) return null;

  for (let index = lastMessage.parts.length - 1; index >= 0; index -= 1) {
    const part = lastMessage.parts[index];
    if (part?.type !== 'actions' || part.actions.length === 0) continue;

    const hasPendingAction = part.actions.some((action) => action.status === 'pending');
    const hasConfirmedAction = part.actions.some((action) => action.status === 'confirmed');
    const allActionsRejected = part.actions.every((action) => action.status === 'rejected');
    if (!hasPendingAction && (hasConfirmedAction || allActionsRejected)) return part.batchId;
  }

  return null;
}
