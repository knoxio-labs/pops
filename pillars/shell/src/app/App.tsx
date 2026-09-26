/**
 * Root App component with all providers
 */
import { browserSdkOptions } from '@/lib/browser-discovery-transport';
import { isNetworkError } from '@/lib/network-error';
import { useThemeStore } from '@/store/themeStore';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useMemo } from 'react';
import { RouterProvider } from 'react-router';

import { ApiError } from '@pops/pillar-sdk/client';
import { PillarSdkProvider } from '@pops/pillar-sdk/react';
import { toastError, Toaster, TooltipProvider } from '@pops/ui';

import { BootRegistryProvider } from './BootRegistryProvider';
import { PillarStatusProvider } from './pillars';
import { buildRouter } from './router';

import type { BootRegistry } from './boot-snapshot';

const NETWORK_ERROR_TOAST_ID = 'network-down';

function operationFromKey(key: readonly unknown[] | undefined, fallback: string): string {
  if (key === undefined || key.length === 0) return fallback;
  const parts = key.flatMap((part) => {
    if (typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean') {
      return String(part);
    }
    return [];
  });
  return parts.length === 0 ? fallback : parts.join('.');
}

/** Converts any rejected value into the safe error contract used by global UI feedback. */
export function normaliseAppError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({
    code: 'web.client.unknown',
    kind: 'client',
    message: 'Something went wrong',
    retryable: false,
  });
}

/** Creates the shell query client with its global query and mutation failure policy. */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!isNetworkError(error)) return;
        toastError(normaliseAppError(error), {
          build: __BUILD_VERSION__,
          id: NETWORK_ERROR_TOAST_ID,
          operation: operationFromKey(query.queryKey, 'query'),
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (mutation.meta?.errorHandled === true) return;
        toastError(normaliseAppError(error), {
          build: __BUILD_VERSION__,
          operation: operationFromKey(mutation.options.mutationKey, 'mutation'),
        });
      },
    }),
  });
}

const queryClient = createAppQueryClient();

interface AppProps {
  /**
   * The boot-resolved install set (P7-T03). Resolved in `main.tsx` from the
   * live registry snapshot (or the cached snapshot when the registry is
   * unreachable) before first render, then threaded in here.
   */
  readonly bootRegistry: BootRegistry;
}

export function App({ bootRegistry }: AppProps) {
  const theme = useThemeStore((state) => state.theme);

  // The install set is fixed for the lifetime of a session: the snapshot is
  // resolved once at boot, so the router is built once from those manifests.
  const router = useMemo(() => buildRouter(bootRegistry.manifests), [bootRegistry.manifests]);

  // Apply theme class to root element
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <PillarSdkProvider options={browserSdkOptions}>
        <BootRegistryProvider value={bootRegistry}>
          <PillarStatusProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
            </TooltipProvider>
          </PillarStatusProvider>
        </BootRegistryProvider>
        {!import.meta.env.VITE_E2E && <ReactQueryDevtools initialIsOpen={false} />}
        <Toaster />
      </PillarSdkProvider>
    </QueryClientProvider>
  );
}
