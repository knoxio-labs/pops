import {
  createEgoChatStates,
  EgoCompactChat,
} from '@/experiments/ego-chat-history/ego-chat-preview';

import type { ScreenMeta } from '@/contract';

export const meta: ScreenMeta = { title: 'Take over chat', order: 2, frame: 'web' };
export const states = createEgoChatStates('takeover');

/** Renders the conversation history in place of the active thread. */
export default function EgoChatTakeoverVariant() {
  return <EgoCompactChat presentation="takeover" />;
}
