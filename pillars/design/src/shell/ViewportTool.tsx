import { RotateCcw, Scan } from 'lucide-react';

import { DockRow, DockTool } from './dock-parts';
import { rotated, VIEWPORT_PRESETS, viewportLabel, type Viewport } from './viewport';

function isSame(a: Viewport, b: Viewport): boolean {
  return a.kind === b.kind && (a.kind === 'full' || viewportLabel(a) === viewportLabel(b));
}

/** Dock tool: simulated screen sizes — presets, ratios, rotate. Drag the frame's corners for a custom size. */
export function ViewportTool({
  viewport,
  onSelect,
}: {
  viewport: Viewport;
  onSelect: (viewport: Viewport) => void;
}) {
  const active = viewport.kind !== 'full';
  return (
    <DockTool
      label={`Viewport: ${viewportLabel(viewport)}`}
      active={active}
      width="w-56"
      trigger={
        <>
          <Scan className="size-4" aria-hidden />
          {active ? <span className="text-xs">{viewportLabel(viewport)}</span> : null}
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
      {active ? (
        <DockRow onSelect={() => onSelect(rotated(viewport))}>
          <span className="inline-flex items-center gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden /> Rotate
          </span>
        </DockRow>
      ) : null}
    </DockTool>
  );
}
