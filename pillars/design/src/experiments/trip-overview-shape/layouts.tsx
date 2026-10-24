import { MapPin } from 'lucide-react';

import { Badge } from '@pops/ui';

import { OverviewDecision, OverviewItemCard, OverviewItemList, OverviewRoute } from './item-card';

import type { TripOverviewItem, TripOverviewLayout } from '@/fixtures/trip-overview';

/** Inputs shared by each genuinely different overview arrangement. */
export interface OverviewLayoutProps {
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}

/** Open choices derived from the shared fixture, with no commitments inferred. */
export function OverviewDecisions({ items, onSelect }: OverviewLayoutProps) {
  const onward = items.filter((item) => item.id === 'connection' || item.id === 'hotel');
  const january = items.filter((item) => ['festival', 'coast', 'minas'].includes(item.id));
  const carnival = items.filter((item) => item.where === 'Rio de Janeiro');
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">What could move the plan forward?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Questions to explore, not a list of overdue tasks.
        </p>
      </div>
      {onward.length > 0 && (
        <OverviewDecision
          title="How will I get to the coast?"
          description="The stay is booked. Compare arrival days before choosing transport."
          options={onward}
          onSelect={onSelect}
        />
      )}
      {january.length > 0 && (
        <OverviewDecision
          title="Coast or inland for January?"
          description="A music weekend and meeting new people could pull the route inland."
          options={january}
          onSelect={onSelect}
        />
      )}
      {carnival.length > 0 && (
        <OverviewDecision
          title="Does Rio fit with the people?"
          description="Keep Carnival open while a friend's dates become clearer."
          options={carnival}
          onSelect={onSelect}
        />
      )}
      {!items.length && (
        <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
          Decisions will emerge as you collect possibilities.
        </p>
      )}
    </section>
  );
}

function Anchors(props: OverviewLayoutProps) {
  return (
    <OverviewItemList
      title="In the working plan"
      description="Bookings and intentions are different kinds of commitment."
      items={props.items.filter((item) => item.intention === 'In plan')}
      onSelect={props.onSelect}
    />
  );
}

function Possibilities(props: OverviewLayoutProps) {
  return (
    <OverviewItemList
      title="Still possible"
      description="Ideas, invitations and people can reshape the route."
      items={props.items.filter((item) => item.intention !== 'In plan' && item.kind !== 'city')}
      onSelect={props.onSelect}
    />
  );
}

function RouteFirst(props: OverviewLayoutProps) {
  return (
    <div className="grid gap-8 xl:grid-cols-3">
      <div className="space-y-8 xl:col-span-2">
        <OverviewRoute {...props} />
        <Possibilities {...props} />
      </div>
      <aside className="space-y-8">
        <Anchors {...props} />
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
    <section className="flex flex-col gap-4 rounded-2xl border bg-muted/20 p-4">
      <div className="space-y-2">
        <MapPin className="size-5 text-app-accent" aria-hidden />
        <h2 className="text-xl font-semibold tracking-tight">{city}</h2>
        <p className="text-sm text-muted-foreground">
          {cityItem?.when ?? 'Dates shaped by the stay'}
        </p>
        <Badge variant="outline">
          {rows.filter((item) => item.intention === 'In plan').length} in plan ·{' '}
          {rows.filter((item) => item.intention !== 'In plan').length} possibilities
        </Badge>
      </div>
      {rows.map((item) => (
        <OverviewItemCard key={item.id} item={item} onSelect={onSelect} compact />
      ))}
    </section>
  );
}

function PlacesFirst(props: OverviewLayoutProps) {
  const cities = [...new Set(props.items.map((item) => item.where))];
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Places the trip could take shape around</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          People, events and arrangements together. No city needs a complete plan.
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
