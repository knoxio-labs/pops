import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { CommentsOverlay } from '../comments/CommentsOverlay';
import { FrameChrome } from '../frames/FrameChrome';
import { parseAddress } from './address';
import { applyThemeToDocument, encodeTheme, type CanvasTheme } from './theme';
import { commentShortcut } from './use-comment-mode';
import {
  frameFromSearch,
  fromFrameRoute,
  themeFromSearch,
  type FrameToShell,
  type ShellToFrame,
} from './viewport';

import type { FrameKind } from '../frames/kind';

function post(message: FrameToShell): void {
  window.parent.postMessage(message, window.location.origin);
}

/**
 * The chrome-less document the canvas iframe loads: the surface under its
 * theme, and the comment overlay when the shell turns it on. The theme
 * arrives once in the URL and afterwards over postMessage; every navigation
 * inside the frame is reported up so the shell's address bar stays the
 * canonical address.
 */
export function FrameShell() {
  const location = useLocation();
  const [theme, setTheme] = useState<CanvasTheme>(() => themeFromSearch(window.location.search));
  const [commentsActive, setCommentsActive] = useState(false);
  const [frame, setFrame] = useState<FrameKind>(() => frameFromSearch(window.location.search));
  const route = fromFrameRoute(location.pathname, location.search);
  const address = parseAddress(route.split('?')[0] ?? route);

  useEffect(() => {
    applyThemeToDocument(document, themeFromSearch(window.location.search));
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data as ShellToFrame;
      if (data.kind === 'theme') {
        applyThemeToDocument(document, data.theme);
        setTheme(data.theme);
      }
      if (data.kind === 'comments') setCommentsActive(data.active);
      if (data.kind === 'frame') setFrame(data.frame);
    };
    // Capture, so it reports the press whatever the surface does with it —
    // including a handler that stops propagation. The shell uses it to
    // dismiss its own popovers, which cannot see a click inside this frame.
    const onPointerDown = () => post({ kind: 'pointerdown' });
    // The surface is where focus lands the moment the user clicks it — which
    // is exactly the moment before they want to comment — so `i` and `Escape`
    // must work from here too. The shell's own listener never fires once
    // focus is inside this document.
    const onKeyDown = (event: KeyboardEvent) => {
      const action = commentShortcut(event);
      if (action) post({ kind: 'comment-shortcut', action });
    };
    window.addEventListener('message', onMessage);
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    document.addEventListener('keydown', onKeyDown);
    post({ kind: 'ready' });
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    post({ kind: 'route', route });
  }, [route]);

  const onOpenCountChange = useCallback((open: number) => {
    post({ kind: 'comment-count', open });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FrameChrome kind={frame} area={address?.area} slug={address?.slug}>
        <Outlet />
      </FrameChrome>
      <CommentsOverlay
        active={commentsActive}
        route={route}
        themeKey={encodeTheme(theme)}
        onOpenCountChange={onOpenCountChange}
        onExit={() => post({ kind: 'comments-exit' })}
      />
    </div>
  );
}
