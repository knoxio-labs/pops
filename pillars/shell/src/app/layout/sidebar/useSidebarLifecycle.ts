import { useEffect, useRef } from 'react';
import { NavigationType, useNavigationType } from 'react-router';

/** Tailwind's `md` breakpoint — from here up the drawer is `md:hidden`. */
const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Everything the mobile drawer must do while it is open, beyond rendering.
 *
 * - Close on navigation. Link taps close it themselves, but a route change
 *   from anywhere else (back button, search result, a pillar's own navigate)
 *   would leave it covering the new page. A REPLACE is not a navigation the
 *   user asked for: `/` redirects to the first app once boot resolves, and
 *   closing on that shut a drawer opened in the moment before it landed.
 * - Close on Escape, as every other modal in the shell does.
 * - Close when the viewport grows past `md`. The drawer is `md:hidden`, so an
 *   open one on a rotated tablet would be invisible yet still hold the scroll
 *   lock.
 * - Lock the page behind it. Without the lock a swipe on the drawer that hit
 *   the end of its list scrolled the page underneath instead.
 *
 * `close` must be referentially stable, or every render re-runs the lock.
 */
export function useSidebarLifecycle(open: boolean, pathname: string, close: () => void): void {
  const navigationType = useNavigationType();
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    if (navigationType !== NavigationType.Replace) close();
  }, [pathname, navigationType, close]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onViewportChange = () => {
      if (desktop.matches) close();
    };

    const { documentElement: html, body } = document;
    const previous = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onViewportChange);

    return () => {
      html.style.overflow = previous.html;
      body.style.overflow = previous.body;
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onViewportChange);
    };
  }, [open, close]);
}
