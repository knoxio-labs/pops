import { OVERLAY_MARKER } from './anchors';

import type { HoverRect } from './use-hover-target';

/**
 * The outline around the element a click would pin a comment to. Marked as
 * overlay chrome and non-interactive, so it can never become the thing the
 * hit test finds under the pointer.
 */
export function HoverHighlight({ rect }: { rect: HoverRect }) {
  return (
    <div
      {...{ [OVERLAY_MARKER]: '' }}
      aria-hidden
      className="pointer-events-none fixed z-[50] rounded-xs border border-primary bg-primary/10"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    />
  );
}
