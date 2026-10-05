import { persistStreamResults } from '../modules/ego/chat-helpers.js';
import { writeSseEvent } from './ego-stream-frames.js';

import type { Request, Response } from 'express';

import type { EgoActionStore } from '../modules/ego/actions-store.js';
import type { Conversation, ConversationPersistence } from '../modules/ego/persistence.js';
import type { ChatStreamPreparation } from '../modules/ego/types.js';

interface PipeStreamParams {
  req: Request;
  res: Response;
  persistence: ConversationPersistence;
  actions: EgoActionStore;
  preparation: ChatStreamPreparation;
  conversation: Conversation;
}

export async function pipeStreamEvents(params: PipeStreamParams): Promise<void> {
  const { req, res, persistence, actions, preparation, conversation } = params;
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  for await (const event of preparation.stream) {
    if (clientDisconnected) break;

    if (event.type === 'token') {
      writeSseEvent(res, { type: 'token', text: event.text });
    } else if (event.type === 'tool') {
      writeSseEvent(res, { type: 'tool', name: event.name, status: event.status });
    } else if (event.type === 'part') {
      writeSseEvent(res, { type: 'part', part: event.part });
    } else if (event.type === 'navigate') {
      writeSseEvent(res, { type: 'navigate', uri: event.uri });
    } else if (event.type === 'done') {
      const assistantMsg = persistStreamResults({
        persistence,
        actions,
        conversationId: conversation.id,
        content: event.content,
        citations: event.citations,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        parts: event.parts,
        batch: event.batch,
        autoExecuted: event.autoExecuted,
        retrievedEngrams: preparation.retrievedEngrams,
        scopeNegotiation: preparation.scopeNegotiation,
      });

      writeSseEvent(res, {
        type: 'done',
        conversationId: conversation.id,
        messageId: assistantMsg.id,
        parts: event.parts,
        citations: event.citations,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        retrievedEngrams: preparation.retrievedEngrams,
        scopeNegotiation: preparation.scopeNegotiation,
      });
    }
  }
}
