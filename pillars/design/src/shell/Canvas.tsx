import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { Overview } from '../pages/Overview';
import { parseAddress } from './address';
import { ViewportFrame } from './ViewportFrame';

import type { FrameKind } from '../frames/kind';
import type { CanvasTheme } from './theme';
import type { CommentMode } from './use-comment-mode';
import type { Viewport } from './viewport';

const TOKENS_ROUTE = '/tokens';

/** Whether a shell location is something the frame renders. */
export function isCanvasRoute(pathname: string): boolean {
  return pathname === TOKENS_ROUTE || parseAddress(pathname) !== null;
}

/**
 * What fills the shell's main area: the overview at `/`, the frame for any
 * canvas route, a note for anything else. The frame reports its own
 * navigation up; the shell mirrors it with `replace` so the address bar is
 * always the canonical address without growing history the frame already grew.
 */
export function Canvas({
  theme,
  viewport,
  frame,
  comments,
  onResize,
}: {
  theme: CanvasTheme;
  viewport: Viewport;
  frame: FrameKind;
  comments: CommentMode;
  onResize: (w: number, h: number) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const route = `${location.pathname}${location.search}`;

  const onRouteChange = useCallback(
    (next: string) => {
      if (next !== route) void navigate(next, { replace: true });
    },
    [navigate, route]
  );

  if (location.pathname === '/') return <Overview />;
  if (!isCanvasRoute(location.pathname)) {
    return <p className="p-8 text-muted-foreground">Nothing at {location.pathname}.</p>;
  }
  return (
    <ViewportFrame
      viewport={viewport}
      route={route}
      theme={theme}
      frame={frame}
      comments={comments}
      onRouteChange={onRouteChange}
      onResize={onResize}
    />
  );
}
