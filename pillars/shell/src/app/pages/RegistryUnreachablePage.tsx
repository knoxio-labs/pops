import { CloudOff } from 'lucide-react';
import { useLocation } from 'react-router';

import { Button } from '@pops/ui';

/**
 * What a reader sees when the pillar they asked for is installed and running
 * and the registry is the thing that is down.
 *
 * Distinct from `NotInstalledPage`, which the router used to render for both.
 * Before the FE-isolation epic that conflation was harmless: the static
 * bundle map meant an in-repo pillar mounted whether or not the registry
 * answered, so "no mounted route" only ever meant "the operator excluded it".
 * POPS-3227 empties that map, leaving the cached snapshot as the only
 * fallback — and a first-time visitor, a cleared browser or a new device has
 * no cache, so every pillar reports itself uninstalled at once (POPS-3250).
 *
 * The two need different words because they need different actions. "Not
 * installed" sends the reader to `POPS_APPS` and a redeploy; the answer here
 * is to wait and reload.
 */
export function RegistryUnreachablePage() {
  const { pathname } = useLocation();
  const moduleId = pathname.split('/').find((s) => s.length > 0) ?? '';

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <CloudOff className="h-16 w-16 text-muted-foreground/40 mb-6" />
      <h1 className="text-2xl font-bold mb-2">Can’t reach the registry</h1>
      <p className="text-muted-foreground mb-6 max-w-prose">
        The shell asks the registry which pillars are live, and it did not answer — so nothing could
        be mounted, including{' '}
        {moduleId ? (
          <code className="font-mono">{moduleId}</code>
        ) : (
          <span>the page you asked for</span>
        )}
        . This says nothing about whether that pillar is running. There is no cached install set on
        this device to fall back on, which is normal on a first visit or after clearing site data.
      </p>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </div>
  );
}
