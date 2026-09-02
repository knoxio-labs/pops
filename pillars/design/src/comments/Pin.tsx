import { anchorLabel, OVERLAY_MARKER, parseAnchor } from './anchors';

import type { Thread } from './api';

/**
 * A numbered dot over the element a thread points at. Rendered only for a
 * thread whose anchor still resolves: a pin floating where its element used
 * to be would be worse than no pin, because it invites a reply about the
 * wrong thing.
 */
export function Pin({
  thread,
  index,
  rect,
  selected,
  onSelect,
}: {
  thread: Thread;
  index: number;
  rect: { left: number; top: number };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      {...{ [OVERLAY_MARKER]: '' }}
      type="button"
      onClick={onSelect}
      aria-label={`Comment ${index} on ${anchorLabel(parseAnchor(thread))}`}
      aria-pressed={selected}
      className={`fixed z-[55] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-2xs font-semibold shadow-sm ${
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-card-foreground'
      }`}
      style={{ left: rect.left, top: rect.top }}
    >
      {index}
    </button>
  );
}
