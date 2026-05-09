import { trpc } from '@/lib/trpc';
import { Outlet } from 'react-router';

import { NotInstalledPage } from './pages/NotInstalledPage';

import type { ReactNode } from 'react';

/**
 * Route-level guard that renders `NotInstalledPage` for any module whose
 * id isn't in this deployment's installed set (PRD-100). Manifest is
 * fetched once via `core.shell.manifest` and cached by React Query.
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
  const { data, isLoading } = trpc.core.shell.manifest.useQuery(undefined, {
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
    );
  }

  const installed = kind === 'overlay' ? data?.overlays : data?.apps;
  if (!installed?.includes(moduleId)) {
    return <NotInstalledPage />;
  }

  return <>{children ?? <Outlet />}</>;
}
