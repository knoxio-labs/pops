import { cn } from '../lib/utils';

import type { HTMLAttributes } from 'react';

export type ConditionalActionGroupProps = HTMLAttributes<HTMLDivElement>;

/** Tight horizontal cluster for stacked media actions (e.g. poster overlays). */
export function ConditionalActionGroup({ className, ...rest }: ConditionalActionGroupProps) {
  return <div className={cn('flex flex-wrap items-center gap-1', className)} {...rest} />;
}

ConditionalActionGroup.displayName = 'ConditionalActionGroup';
