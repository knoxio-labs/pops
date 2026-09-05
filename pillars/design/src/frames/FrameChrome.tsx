import { WebFrame } from './web/WebFrame';

import type { ReactNode } from 'react';

import type { FrameKind } from './kind';

/**
 * Wraps the surface in the selected product chrome. `none` is not a special
 * case worth a component — the surface is simply itself.
 */
export function FrameChrome({
  kind,
  area,
  slug,
  children,
}: {
  kind: FrameKind;
  area: string | undefined;
  slug: string | undefined;
  children: ReactNode;
}) {
  if (kind === 'web') {
    return (
      <WebFrame area={area} slug={slug}>
        {children}
      </WebFrame>
    );
  }
  return <>{children}</>;
}
