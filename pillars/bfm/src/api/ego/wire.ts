import { z } from 'zod';

import { filterKnownParts } from '../../contract/mobile-ego-schemas.js';

import type {
  MobileEgoConversationPageSchema,
  MobileEgoConversationSchema,
  MobileEgoMessageSchema,
  MobileEgoThreadSchema,
} from '../../contract/mobile-ego-schemas.js';

/** Cerebrum's persisted conversation summary, narrowed to fields BFM emits. */
export const UpstreamEgoConversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Cerebrum's stored message shape, including its legacy markdown content. */
export const UpstreamEgoMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z.string(),
  parts: z.array(z.unknown()).optional(),
});

/** List response from cerebrum's ego.listConversations operation. */
export const UpstreamEgoConversationPageSchema = z.object({
  conversations: z.array(UpstreamEgoConversationSchema),
  total: z.number(),
});

/** Thread response from cerebrum's ego.getConversation operation. */
export const UpstreamEgoThreadSchema = z.object({
  conversation: UpstreamEgoConversationSchema,
  messages: z.array(UpstreamEgoMessageSchema),
});

type UpstreamEgoConversation = z.infer<typeof UpstreamEgoConversationSchema>;
type UpstreamEgoMessage = z.infer<typeof UpstreamEgoMessageSchema>;
type UpstreamEgoPage = z.infer<typeof UpstreamEgoConversationPageSchema>;
type UpstreamEgoThread = z.infer<typeof UpstreamEgoThreadSchema>;
type MobileEgoConversation = z.infer<typeof MobileEgoConversationSchema>;
type MobileEgoMessage = z.infer<typeof MobileEgoMessageSchema>;
type MobileEgoPage = z.infer<typeof MobileEgoConversationPageSchema>;
type MobileEgoThread = z.infer<typeof MobileEgoThreadSchema>;

function toMobileConversation(conversation: UpstreamEgoConversation): MobileEgoConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

/** Map cerebrum's open conversation rows to BFM's mobile response shape. */
export function toMobileConversationPage(page: UpstreamEgoPage): MobileEgoPage {
  return {
    conversations: page.conversations.map(toMobileConversation),
    total: page.total,
  };
}

/**
 * Map one stored message; unsupported roles are omitted and unknown parts
 * cannot cross the mobile boundary.
 */
export function toMobileMessage(message: UpstreamEgoMessage): MobileEgoMessage | undefined {
  if (message.role !== 'user' && message.role !== 'assistant') return undefined;

  const parts =
    message.parts !== undefined && message.parts.length > 0
      ? filterKnownParts(message.parts)
      : [{ type: 'text' as const, text: message.content }];

  return {
    id: message.id,
    role: message.role,
    parts,
    createdAt: message.createdAt,
  };
}

/** Map cerebrum's conversation and messages to BFM's mobile thread shape. */
export function toMobileThread(thread: UpstreamEgoThread): MobileEgoThread {
  return {
    conversation: toMobileConversation(thread.conversation),
    messages: thread.messages.flatMap((message) => {
      const mapped = toMobileMessage(message);
      return mapped === undefined ? [] : [mapped];
    }),
  };
}
