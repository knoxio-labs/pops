import { CommentsTool } from './CommentsTool';
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
  onThemeSelect,
  onViewportSelect,
  onFrameSelect,
}: {
  catalog: Catalog;
  theme: CanvasTheme;
  viewport: Viewport;
  frame: FrameKind;
  comments: { active: boolean; openCount: number; onToggle: () => void };
  onThemeSelect: (theme: CanvasTheme) => void;
  onViewportSelect: (viewport: Viewport) => void;
  onFrameSelect: (frame: FrameKind) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2">
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
    </div>
  );
}
