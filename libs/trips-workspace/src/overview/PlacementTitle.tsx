import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { OverviewPlacementTarget, TripOverviewProps } from './types';

/** Structural references open only an explicitly supplied host editor; absent callbacks stay read-only. */
export function PlacementTitle(
  props: Pick<TripOverviewProps, 'onOpenPlacement'> & {
    target: OverviewPlacementTarget;
    title: string;
  }
): JSX.Element {
  const open = props.onOpenPlacement;
  return open ? (
    <Button
      variant="ghost"
      className="min-h-11 whitespace-normal text-left"
      onClick={() => open(props.target)}
    >
      {props.title}
    </Button>
  ) : (
    <span>{props.title}</span>
  );
}
