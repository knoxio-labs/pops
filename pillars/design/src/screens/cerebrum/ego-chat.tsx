import {
  createEgoChatStates,
  EgoCompactChat,
} from '@/experiments/ego-chat-history/ego-chat-preview';

import type { ScreenMeta } from '@/contract';

export const meta: ScreenMeta = { title: 'Ego chat', order: 1, frame: 'web' };
export const states = createEgoChatStates('sheet');

/** Renders the compact Ego chat baseline for the history layout experiment. */
export default function EgoChatScreen() {
  return <EgoCompactChat />;
}
