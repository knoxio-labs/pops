/**
 * Where each thread's pin sits, in viewport coordinates of the frame's own
 * document.
 *
 * Threads whose anchor no longer resolves are dropped rather than parked at
 * the origin: a pin sitting where its element used to be invites a reply
 * about the wrong thing.
 */
import { parseAnchor, resolveAnchor } from './anchors';

import type { Thread } from './api';

export interface PlacedPin {
  thread: Thread;
  /** 1-based, matching the numbering in the panel. */
  index: number;
  left: number;
  top: number;
}

export function placePins(doc: Document, threads: Thread[]): PlacedPin[] {
  const placed: PlacedPin[] = [];
  threads.forEach((thread, i) => {
    const el = resolveAnchor(doc, parseAnchor(thread));
    if (!el) return;
    const rect = el.getBoundingClientRect();
    placed.push({ thread, index: i + 1, left: rect.left + rect.width / 2, top: rect.top });
  });
  return placed;
}
