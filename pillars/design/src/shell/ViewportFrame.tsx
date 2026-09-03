import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';

import { useAvail, useCornerDrag, useFrameMessages } from './frame-hooks';
import {
  frameSize,
  toFrameRoute,
  type FrameToShell,
  type ShellToFrame,
  type Viewport,
} from './viewport';

import type { FrameKind } from '../frames/kind';
import type { CanvasTheme } from './theme';
import type { CommentMode } from './use-comment-mode';

const HANDLES = [
  { corner: 'nw', className: '-top-1.5 -left-1.5 cursor-nwse-resize' },
  { corner: 'ne', className: '-top-1.5 -right-1.5 cursor-nesw-resize' },
  { corner: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
  { corner: 'se', className: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
];

/** The document URL for a shell route: the router base plus the frame route. */
function frameSrc(route: string, theme: CanvasTheme, frame: FrameKind): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/u, '')}${toFrameRoute(route, theme, frame)}`;
}

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

/** Everything the frame is told about rather than reloaded for. */
interface FrameChrome {
  theme: CanvasTheme;
  commentsActive: boolean;
  frame: FrameKind;
}

/** Push each chrome setting down as it changes. */
function usePushChrome(post: (message: ShellToFrame) => void, chrome: FrameChrome): void {
  const { theme, commentsActive, frame } = chrome;

  useEffect(() => {
    post({ kind: 'theme', theme });
  }, [post, theme]);

  useEffect(() => {
    post({ kind: 'comments', active: commentsActive });
  }, [commentsActive, post]);

  useEffect(() => {
    post({ kind: 'frame', frame });
  }, [frame, post]);
}

/**
 * Keeps the frame on the shell's route, theme, comment mode and product
 * chrome: reload on route, message on the rest.
 *
 * Comment mode is re-sent on every `ready` alongside the theme, because a
 * route change reloads the frame document — without it, navigating with the
 * overlay open would leave the dock lit and the surface inert.
 */
function useFrameSync(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  {
    route,
    theme,
    frame,
    comments,
    onRouteChange,
    onSurfacePointerDown,
  }: Pick<
    ViewportFrameProps,
    'route' | 'theme' | 'frame' | 'comments' | 'onRouteChange' | 'onSurfacePointerDown'
  >
): void {
  const frameRouteRef = useRef(route);
  // The theme is read at document load only; later changes go over postMessage,
  // so the reload effect reads it through a ref rather than depending on it.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const commentsActiveRef = useRef(comments.active);
  commentsActiveRef.current = comments.active;

  const { exit, setOpenCount } = comments;

  const post = useCallback(
    (message: ShellToFrame) => {
      iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
    },
    [iframeRef]
  );

  useFrameMessages(
    iframeRef,
    useCallback(
      (message: FrameToShell) => {
        if (message.kind === 'route') {
          frameRouteRef.current = message.route;
          onRouteChange(message.route);
        }
        if (message.kind === 'ready') {
          post({ kind: 'theme', theme: themeRef.current });
          post({ kind: 'comments', active: commentsActiveRef.current });
          post({ kind: 'frame', frame: frameRef.current });
        }
        if (message.kind === 'comment-count') setOpenCount(message.open);
        if (message.kind === 'comments-exit') exit();
        if (message.kind === 'pointerdown') onSurfacePointerDown();
      },
      [exit, onRouteChange, onSurfacePointerDown, post, setOpenCount]
    )
  );

  usePushChrome(post, { theme, commentsActive: comments.active, frame });

  useEffect(() => {
    if (route !== frameRouteRef.current) {
      frameRouteRef.current = route;
      iframeRef.current?.contentWindow?.location.replace(
        frameSrc(route, themeRef.current, frameRef.current)
      );
    }
  }, [iframeRef, route]);
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
