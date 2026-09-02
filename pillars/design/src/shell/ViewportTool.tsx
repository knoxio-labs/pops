import { RotateCcw, Scan } from 'lucide-react';

import { frameLabel, FRAME_KINDS, type FrameKind } from '../frames/kind';
import { DockRow, DockTool } from './dock-parts';
import { rotated, VIEWPORT_PRESETS, viewportLabel, type Viewport } from './viewport';

function isSame(a: Viewport, b: Viewport): boolean {
  return a.kind === b.kind && (a.kind === 'full' || viewportLabel(a) === viewportLabel(b));
}

/**
 * Dock tool: two axes of "where is this seen" — the simulated screen size
 * (presets, ratios, rotate; drag the frame's corners for a custom size) and
 * the product chrome drawn around the surface. They belong in one tool
 * because they are one question: a phone-width screen inside the POPS web
 * chrome is a different design from the same width with no chrome at all.
 */
export function ViewportTool({
  viewport,
  frame,
  onSelect,
  onFrameSelect,
}: {
  viewport: Viewport;
  frame: FrameKind;
  onSelect: (viewport: Viewport) => void;
  onFrameSelect: (frame: FrameKind) => void;
}) {
  const active = viewport.kind !== 'full' || frame !== 'none';
  const summary = frame === 'none' ? viewportLabel(viewport) : frameLabel(frame);
  return (
    <DockTool
      label={`Viewport: ${viewportLabel(viewport)} · ${frameLabel(frame)}`}
      active={active}
      width="w-56"
      trigger={
        <>
          <Scan className="size-4" aria-hidden />
          {active ? <span className="text-xs">{summary}</span> : null}
        </>
      }
    >
      {VIEWPORT_PRESETS.map((preset) => (
        <DockRow
          key={viewportLabel(preset)}
          current={isSame(preset, viewport)}
          onSelect={() => onSelect(preset)}
          trailing={
            preset.kind === 'fixed' ? (
              <span className="font-mono tabular-nums">
                {preset.w}×{preset.h}
              </span>
            ) : undefined
          }
        >
          {preset.kind === 'fixed' ? preset.label : viewportLabel(preset)}
        </DockRow>
      ))}
      {viewport.kind !== 'full' ? (
        <DockRow onSelect={() => onSelect(rotated(viewport))}>
          <span className="inline-flex items-center gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden /> Rotate
          </span>
        </DockRow>
      ) : null}
      <div className="my-1 border-t border-border" />
      {FRAME_KINDS.map((kind) => (
        <DockRow key={kind} current={kind === frame} onSelect={() => onFrameSelect(kind)}>
          {frameLabel(kind)}
        </DockRow>
      ))}
    </DockTool>
  );
}
