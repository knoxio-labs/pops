import { CommentsTool } from './CommentsTool';
import { DockDismiss } from './dock-parts';
import { StateTool } from './StateTool';
import { ThemeTool } from './ThemeTool';
import { VariantTool } from './VariantTool';
import { ViewportTool } from './ViewportTool';

import type { FrameKind } from '../frames/kind';
import type { Catalog } from '../registry';
import type { CanvasTheme } from './theme';
import type { Viewport } from './viewport';

/**
 * The floating bottom-centre dock over the canvas: theme, design (variant),
 * state, viewport and comments. It is chrome — it never enters the frame, so nothing
 * on it can be mistaken for part of a design.
 */
export function Dock({
  catalog,
  theme,
  viewport,
  frame,
  comments,
  dismissToken,
  onThemeSelect,
  onViewportSelect,
  onFrameSelect,
}: {
  catalog: Catalog;
  theme: CanvasTheme;
  viewport: Viewport;
  frame: FrameKind;
  comments: { active: boolean; openCount: number; onToggle: () => void };
  /** Bumped when something outside the dock — including the canvas iframe —
   *  should close whatever tool is open. */
  dismissToken: number;
  onThemeSelect: (theme: CanvasTheme) => void;
  onViewportSelect: (viewport: Viewport) => void;
  onFrameSelect: (frame: FrameKind) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2">
      <DockDismiss token={dismissToken}>
        <div className="pointer-events-auto flex items-center gap-2">
          <ThemeTool theme={theme} onSelect={onThemeSelect} />
          <VariantTool catalog={catalog} />
          <StateTool catalog={catalog} />
          <ViewportTool
            viewport={viewport}
            frame={frame}
            onSelect={onViewportSelect}
            onFrameSelect={onFrameSelect}
          />
          <CommentsTool
            active={comments.active}
            openCount={comments.openCount}
            onToggle={comments.onToggle}
          />
        </div>
      </DockDismiss>
    </div>
  );
}
