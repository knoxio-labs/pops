import { useMemo } from 'react';

import { useBootRegistry } from '../../BootRegistryProvider';
import { rankTopBarWidgets } from './top-bar-widget-registry';

/**
 * The top-bar widgets registered pillars contribute through their manifest's
 * `topBarWidgets`, resolved from the boot bundle map and rendered in rank
 * order. Renders nothing when no registered pillar contributes one.
 */
export function TopBarWidgets() {
  const { bundleMap } = useBootRegistry();
  const widgets = useMemo(() => rankTopBarWidgets(bundleMap), [bundleMap]);
  return (
    <>
      {widgets.map(({ pillarId, bundleSlot, Component }) => (
        <Component key={`${pillarId}:${bundleSlot}`} />
      ))}
    </>
  );
}
