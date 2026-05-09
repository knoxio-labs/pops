import { trpc } from '@/lib/trpc';
import { Outlet } from 'react-router';

import { NotInstalledPage } from './pages/NotInstalledPage';

import type { ReactNode } from 'react';

/**
 * Route-level guard that renders `NotInstalledPage` for any module whose
 * id isn't in this deployment's installed set (PRD-100). Manifest is
 * fetched once via `core.shell.manifest` and cached by React Query.
 *
 * Optimistic: while the manifest query is still in flight (or has errored),
 * render children. Only flip to `NotInstalledPage` when the manifest has
 * loaded and explicitly does not include this module — avoids a flicker on
 * every navigation in the common case where everything is installed.
 */
export function RequireModule({
  moduleId,
  kind = 'app',
  children,
}: {
  moduleId: string;
  kind?: 'app' | 'overlay';
  children?: ReactNode;
}) {
  const { data } = trpc.core.shell.manifest.useQuery(undefined, {
    staleTime: Infinity,
  });

  if (data) {
    const installed = kind === 'overlay' ? data.overlays : data.apps;
    if (!installed.includes(moduleId)) {
      return <NotInstalledPage />;
    }
  }

  return <>{children ?? <Outlet />}</>;
}
