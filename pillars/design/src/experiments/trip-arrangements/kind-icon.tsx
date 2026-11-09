import { ArrowRightLeft, BedDouble, CarFront, Plane, Ticket } from 'lucide-react';

import { arrangementKindOptions } from './filters';

import type { ArrangementRow } from './model';

/** Uses explicit arrangement and flight-booking kinds; a transport gap never implies a mode. */
export function ArrangementKindIcon({
  kind,
  flight = false,
}: {
  kind: ArrangementRow['kind'];
  flight?: boolean;
}) {
  const transport = flight ? Plane : ArrowRightLeft;
  const Icon = { transport, stay: BedDouble, event: Ticket, rental: CarFront }[kind];
  return (
    <Icon
      className="size-4 shrink-0 text-muted-foreground"
      role="img"
      aria-label={arrangementKindOptions.find((option) => option.value === kind)?.label}
    />
  );
}
