import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { toFrameRoute, type FrameToShell, type ShellToFrame } from './viewport';

import type { FrameKind } from '../frames/kind';
import type { CanvasTheme } from './theme';
import type { CommentMode } from './use-comment-mode';

export interface Avail {
  w: number;
  h: number;
}

/** The document URL for a shell route: the router base plus the frame route. */
export function frameSrc(route: string, theme: CanvasTheme, frame: FrameKind): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/u, '')}${toFrameRoute(route, theme, frame)}`;
}

/** The canvas area a sized frame may occupy, minus room for the handles and the size label. */
export function useAvail(ref: RefObject<HTMLDivElement | null>): Avail | null {
  const [avail, setAvail] = useState<Avail | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setAvail({ w: Math.max(el.clientWidth - 48, 200), h: Math.max(el.clientHeight - 64, 200) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return avail;
}

/**
 * Messages from this frame only: same origin, and the sender must be the
 * iframe's own window, so a stray message from anywhere else is ignored.
 */
export function useFrameMessages(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  onMessage: (message: FrameToShell) => void
): void {
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      onMessage(event.data as FrameToShell);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [iframeRef, onMessage]);
}

/**
 * Corner-drag resizing: the frame grows symmetrically around the canvas
 * centre, and the shell receives the size in the frame's own CSS pixels
 * (undoing the fit-to-canvas scale).
 */
export function useCornerDrag(
  containerRef: RefObject<HTMLDivElement | null>,
  scale: number,
  onResize: (w: number, h: number) => void
): { dragging: boolean; startDrag: (event: React.PointerEvent) => void } {
  const [dragging, setDragging] = useState(false);
  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    setDragging(true);
    const rect = container.getBoundingClientRect();
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const onMove = (move: PointerEvent) => {
      const w = Math.max(240, Math.round(Math.abs(move.clientX - centre.x) * 2) / scale);
      const h = Math.max(240, Math.round(Math.abs(move.clientY - centre.y) * 2) / scale);
      onResize(Math.round(w), Math.round(h));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  return { dragging, startDrag };
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

export interface FrameSyncProps {
  route: string;
  theme: CanvasTheme;
  frame: FrameKind;
  comments: CommentMode;
  onRouteChange: (route: string) => void;
  onSurfacePointerDown: () => void;
}

/** What `useFrameSync` does with each message the frame reports up. */
function useFrameMessageHandler(
  post: (message: ShellToFrame) => void,
  refs: {
    frameRouteRef: RefObject<string>;
    themeRef: RefObject<CanvasTheme>;
    frameRef: RefObject<FrameKind>;
    commentsActiveRef: RefObject<boolean>;
  },
  {
    onRouteChange,
    onSurfacePointerDown,
    toggle,
    exit,
    setOpenCount,
  }: Pick<FrameSyncProps, 'onRouteChange' | 'onSurfacePointerDown'> &
    Pick<CommentMode, 'toggle' | 'exit' | 'setOpenCount'>
): (message: FrameToShell) => void {
  return useCallback(
    (message: FrameToShell) => {
      if (message.kind === 'route') {
        refs.frameRouteRef.current = message.route;
        onRouteChange(message.route);
      }
      if (message.kind === 'ready') {
        post({ kind: 'theme', theme: refs.themeRef.current });
        post({ kind: 'comments', active: refs.commentsActiveRef.current });
        post({ kind: 'frame', frame: refs.frameRef.current });
      }
      if (message.kind === 'comment-count') setOpenCount(message.open);
      if (message.kind === 'comments-exit') exit();
      if (message.kind === 'pointerdown') onSurfacePointerDown();
      if (message.kind === 'comment-shortcut') {
        if (message.action === 'toggle') toggle();
        if (message.action === 'exit') exit();
      }
    },
    [exit, onRouteChange, onSurfacePointerDown, post, refs, setOpenCount, toggle]
  );
}

/**
 * Keeps the frame on the shell's route, theme, comment mode and product
 * chrome: reload on route, message on the rest.
 *
 * Comment mode is re-sent on every `ready` alongside the theme, because a
 * route change reloads the frame document — without it, navigating with the
 * overlay open would leave the dock lit and the surface inert.
 */
export function useFrameSync(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  { route, theme, frame, comments, onRouteChange, onSurfacePointerDown }: FrameSyncProps
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

  const { toggle, exit, setOpenCount } = comments;

  const post = useCallback(
    (message: ShellToFrame) => {
      iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
    },
    [iframeRef]
  );

  useFrameMessages(
    iframeRef,
    useFrameMessageHandler(
      post,
      { frameRouteRef, themeRef, frameRef, commentsActiveRef },
      {
        onRouteChange,
        onSurfacePointerDown,
        toggle,
        exit,
        setOpenCount,
      }
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
