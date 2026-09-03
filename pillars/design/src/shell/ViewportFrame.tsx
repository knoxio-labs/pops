import { useRef, type ReactNode, type RefObject } from 'react';

import { frameSrc, useAvail, useCornerDrag, useFrameSync } from './frame-hooks';
import { frameSize, type Viewport } from './viewport';

import type { FrameKind } from '../frames/kind';
import type { CanvasTheme } from './theme';
import type { CommentMode } from './use-comment-mode';

const HANDLES = [
  { corner: 'nw', className: '-top-1.5 -left-1.5 cursor-nwse-resize' },
  { corner: 'ne', className: '-top-1.5 -right-1.5 cursor-nesw-resize' },
  { corner: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
  { corner: 'se', className: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
];

interface ViewportFrameProps {
  viewport: Viewport;
  /** Shell route, `pathname + search`, router-relative. */
  route: string;
  theme: CanvasTheme;
  frame: FrameKind;
  comments: CommentMode;
  onRouteChange: (route: string) => void;
  onResize: (w: number, h: number) => void;
  /** A press landed on the surface — see `FrameToShell`'s `pointerdown`. */
  onSurfacePointerDown: () => void;
}

/** A frame at a simulated size, scaled to fit the canvas, with corner handles for a custom size. */
function SizedFrame({
  containerRef,
  size,
  scale,
  onResize,
  children,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  size: { w: number; h: number };
  scale: number;
  onResize: (w: number, h: number) => void;
  children: ReactNode;
}) {
  const { dragging, startDrag } = useCornerDrag(containerRef, scale, onResize);
  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden bg-muted/40"
    >
      <div className="relative" style={{ width: size.w * scale, height: size.h * scale }}>
        <div
          className="absolute top-0 left-0 origin-top-left overflow-hidden rounded-md shadow-lg outline outline-border"
          style={{
            width: size.w,
            height: size.h,
            transform: `scale(${scale})`,
            pointerEvents: dragging ? 'none' : undefined,
          }}
        >
          {children}
        </div>
        {HANDLES.map(({ corner, className }) => (
          <span
            key={corner}
            onPointerDown={startDrag}
            className={`absolute z-10 size-3 rounded-full border border-border bg-card shadow-sm ${className}`}
          />
        ))}
        <span className="absolute -bottom-6 left-0 font-mono text-2xs text-muted-foreground tabular-nums">
          {size.w}×{size.h}
          {scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * Hosts a surface in a same-origin iframe. Always — even at Full — so the
 * canvas theme is a document of its own and never leaks into the chrome or
 * out of it, and so responsive utilities respond exactly as on the device
 * at a simulated size. The frame is mounted once per document and navigates
 * internally; route changes flow up via postMessage, theme changes flow down.
 */
export function ViewportFrame({
  viewport,
  route,
  theme,
  frame,
  comments,
  onRouteChange,
  onResize,
  onSurfacePointerDown,
}: ViewportFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initialSrc = useRef(frameSrc(route, theme, frame));
  const avail = useAvail(containerRef);
  useFrameSync(iframeRef, {
    route,
    theme,
    frame,
    comments,
    onRouteChange,
    onSurfacePointerDown,
  });

  // Unsandboxed by design: the frame is this same app, and it needs its own
  // origin for the postMessage handshake and for storage. A sandbox that
  // allows both scripts and same-origin is no sandbox at all, and the lint
  // rule says so, so the attribute is left off rather than faked.
  const iframe = (
    <iframe
      ref={iframeRef}
      src={initialSrc.current}
      title="Design canvas"
      className="h-full w-full border-0 bg-background"
    />
  );

  if (viewport.kind === 'full') {
    return (
      <div ref={containerRef} className="h-full w-full">
        {iframe}
      </div>
    );
  }
  if (!avail) return <div ref={containerRef} className="h-full w-full" />;

  const size = frameSize(viewport, avail);
  const scale = Math.min(1, avail.w / size.w, avail.h / size.h);
  return (
    <SizedFrame containerRef={containerRef} size={size} scale={scale} onResize={onResize}>
      {iframe}
    </SizedFrame>
  );
}
