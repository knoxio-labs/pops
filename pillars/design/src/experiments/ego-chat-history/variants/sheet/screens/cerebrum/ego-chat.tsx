import {
  createEgoChatStates,
  EgoCompactChat,
} from '@/experiments/ego-chat-history/ego-chat-preview';

import type { ScreenMeta } from '@/contract';

export const meta: ScreenMeta = { title: 'Side sheet', order: 1, frame: 'web' };
export const states = createEgoChatStates('sheet');

/** Renders the conversation history in a side sheet beside the active thread. */
export default function EgoChatSheetVariant() {
  return <EgoCompactChat presentation="sheet" />;
}
