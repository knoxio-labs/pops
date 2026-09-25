/**
 * A location page whose place no longer exists: deleted here or on another
 * device. It says so, says where the things it held went, and offers the
 * two places to go next.
 */
import { MapPinOff } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';
import { FitPage } from '../locations-tree/fit-page';

/** Props for {@link PlaceGone}. */
export interface PlaceGoneProps {
  name?: string;
  /** Things that went in hand, marked Previous place deleted. */
  inHand?: number;
  deletedBy?: string;
}

/** The gone state. */
export function PlaceGone({ name = 'This place', inHand = 0, deletedBy }: PlaceGoneProps) {
  const by = deletedBy ? ` on ${deletedBy}` : '';
  const things = inHand === 1 ? '1 thing it held is' : `${inHand} things it held are`;
  return (
    <FitPage
      title={name}
      icon={MapPinOff}
      breadcrumbs={[{ label: 'Locations', href: '#locations' }, { label: name }]}
    >
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
        <EmptyState
          icon={MapPinOff}
          title={`${name} was deleted${by}`}
          description={
            inHand > 0
              ? `${things} in hand, marked Previous place deleted. Put them somewhere from In hand.`
              : 'It held nothing when it was deleted.'
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline">Back to Locations</Button>
              {inHand > 0 ? (
                <Button prefix={<INVENTORY_ICONS.inHand className="size-4" aria-hidden />}>
                  Open In hand
                </Button>
              ) : null}
            </div>
          }
        />
      </div>
    </FitPage>
  );
}
