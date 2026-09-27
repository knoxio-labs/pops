import { MapPinOff } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { InventoryPage } from '../../foundation/frame/page-frame.js';

import type { ReactElement } from 'react';

/** Props for the terminal state of a previously deleted place. */
export interface PlaceGoneProps {
  name?: string;
  inHand?: number;
  deletedBy?: string;
  onBack: () => void;
  onOpenInHand: () => void;
}

/** Renders the deleted-place summary and its two recovery destinations. */
export function PlaceGone({
  name = 'This place',
  inHand = 0,
  deletedBy,
  onBack,
  onOpenInHand,
}: PlaceGoneProps): ReactElement {
  const deletedCopy = deletedBy ? ` on ${deletedBy}` : '';
  const heldCopy = inHand === 1 ? '1 thing it held is' : `${inHand} things it held are`;
  return (
    <InventoryPage
      title={name}
      icon={MapPinOff}
      breadcrumbs={[{ label: 'Locations', href: '/inventory/locations' }, { label: name }]}
    >
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
        <EmptyState
          icon={MapPinOff}
          title={`${name} was deleted${deletedCopy}`}
          description={
            inHand > 0
              ? `${heldCopy} in hand, marked Previous place deleted. Put them somewhere from In hand.`
              : 'It held nothing when it was deleted.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={onBack}>
                Back to Locations
              </Button>
              {inHand > 0 ? <Button onClick={onOpenInHand}>Open In hand</Button> : null}
            </div>
          }
        />
      </div>
    </InventoryPage>
  );
}
