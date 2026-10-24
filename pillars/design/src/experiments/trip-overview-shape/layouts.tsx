import { isPurchasedArrangement } from '@/fixtures/trip-overview-model';
import { MapPin } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { OverviewItemCard, OverviewItemList } from './item-card';
import { OverviewRoute } from './route';

import type { TripOverviewItem, TripOverviewLayout } from '@/fixtures/trip-overview';

/** Inputs shared by each genuinely different overview arrangement. */
export interface OverviewLayoutProps {
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}

/** Derive unresolved entries from missing purchases and open route segments. */
export function OverviewDecisions({ items, onSelect }: OverviewLayoutProps) {
  const unresolved = items.filter(
    (item) => item.kind === 'gap' || (item.kind === 'transport' && !isPurchasedArrangement(item))
  );
  return <OverviewItemList title="Unresolved" items={unresolved} onSelect={onSelect} />;
}

function Anchors(props: OverviewLayoutProps) {
  return (
    <OverviewItemList
      title="Purchased"
      description="Flights, stays and tickets with purchase evidence."
      items={props.items.filter(isPurchasedArrangement)}
      onSelect={props.onSelect}
    />
  );
}

function Possibilities(props: OverviewLayoutProps) {
  return (
    <OverviewItemList
      title="Options"
      description="Unscheduled places, events and contacts."
      items={props.items.filter(
        (item) => item.sequence === undefined && item.intention !== 'In plan' && item.kind !== 'gap'
      )}
      onSelect={props.onSelect}
    />
  );
}

function RouteFirst(props: OverviewLayoutProps) {
  return (
    <div className="grid gap-8 xl:grid-cols-3">
      <div className="space-y-8 xl:col-span-2">
        <OverviewRoute {...props} />
      </div>
      <aside className="space-y-8">
        <OverviewDecisions {...props} />
      </aside>
    </div>
  );
}

function DecisionFirst(props: OverviewLayoutProps) {
  return (
    <div className="grid gap-8 xl:grid-cols-3">
      <div className="space-y-8 xl:col-span-2">
        <OverviewDecisions {...props} />
        <Possibilities {...props} />
      </div>
      <aside className="space-y-8">
        <OverviewRoute {...props} />
        <Anchors {...props} />
      </aside>
    </div>
  );
}

function PlaceGroup({ city, items, onSelect }: OverviewLayoutProps & { city: string }) {
  const rows = items.filter((item) => item.where === city);
  const cityItem = rows.find((item) => item.kind === 'city');
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-muted p-5">
      <div className="space-y-2">
        <MapPin className="size-5 text-app-accent" aria-hidden />
        <h2>
          <Button
            variant="ghost"
            className="h-auto min-h-11 justify-start px-0 text-2xl font-bold tracking-tight"
            disabled={!cityItem}
            onClick={() => {
              if (cityItem) onSelect(cityItem);
            }}
          >
            {city}
          </Button>
        </h2>
        <p className="text-sm leading-relaxed text-foreground/80">
          {cityItem?.when ?? 'Dates not set'}
        </p>
        <Badge variant="outline">
          {rows.filter((item) => item.intention === 'In plan').length} in plan ·{' '}
          {rows.filter((item) => item.intention !== 'In plan').length} possibilities
        </Badge>
      </div>
      {rows
        .filter((item) => item.kind !== 'city')
        .map((item) => (
          <OverviewItemCard key={item.id} item={item} onSelect={onSelect} />
        ))}
    </section>
  );
}

function PlacesFirst(props: OverviewLayoutProps) {
  const cities = [...new Set(props.items.map((item) => item.where))];
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Cities</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground/80">
          Dates, contacts, events and arrangements by city.
        </p>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {cities.map((city) => (
          <PlaceGroup key={city} city={city} {...props} />
        ))}
      </div>
      <OverviewDecisions {...props} />
    </div>
  );
}

/** Select the proposed information hierarchy without changing its data or actions. */
export function OverviewLayout({
  layout,
  ...props
}: OverviewLayoutProps & { layout: TripOverviewLayout }) {
  if (layout === 'decision-first') return <DecisionFirst {...props} />;
  if (layout === 'places-first') return <PlacesFirst {...props} />;
  return <RouteFirst {...props} />;
}
