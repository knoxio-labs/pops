import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';

import { Toaster, TooltipProvider } from '@pops/ui';

import { routes } from '../routes';

/**
 * The pillar's pages, with the little the shell normally provides around them
 * and nothing else.
 *
 * There is no rail, no top bar and no search: the point of this harness is one
 * pillar with no shell, so a stub of the shell would be the wrong thing to
 * look at. What it does provide is what the pages actually consume — a router,
 * a query client, and `@pops/ui`'s tooltip and toast providers — because a
 * page that renders without them is not the page that ships.
 *
 * Routes are mounted under `/purchases`, the same prefix the shell mounts them
 * at, so a URL means the same thing in both. Comparing the two is most of what
 * this harness is for.
 */

/**
 * `retry: false` and no refetch on focus, unlike the shell's client.
 *
 * A mock answers instantly and identically, so a retry can only turn a
 * deliberate 404 or 501 fixture into three of them and a slower failing state.
 * The states this harness exists to let someone look at include the failures.
 */
function createStandaloneQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

function PillarFrame() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}

export function createStandaloneRouter() {
  return createBrowserRouter([
    { path: '/', element: <Navigate to="/purchases" replace /> },
    { path: '/purchases', element: <PillarFrame />, children: routes },
  ]);
}

export function StandaloneApp() {
  return (
    <QueryClientProvider client={createStandaloneQueryClient()}>
      <TooltipProvider>
        <RouterProvider router={createStandaloneRouter()} />
      </TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
