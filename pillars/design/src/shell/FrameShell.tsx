import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';

import { applyThemeToDocument } from './theme';
import { fromFrameRoute, themeFromSearch, type FrameToShell, type ShellToFrame } from './viewport';

function post(message: FrameToShell): void {
  window.parent.postMessage(message, window.location.origin);
}

/**
 * The chrome-less document the canvas iframe loads: the surface under its
 * theme and nothing else. The theme arrives once in the URL and afterwards
 * over postMessage; every navigation inside the frame is reported up so the
 * shell's address bar stays the canonical address.
 */
export function FrameShell() {
  const location = useLocation();

  useEffect(() => {
    applyThemeToDocument(document, themeFromSearch(window.location.search));
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data as ShellToFrame;
      if (data.kind === 'theme') applyThemeToDocument(document, data.theme);
    };
    window.addEventListener('message', onMessage);
    post({ kind: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    post({ kind: 'route', route: fromFrameRoute(location.pathname, location.search) });
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}
