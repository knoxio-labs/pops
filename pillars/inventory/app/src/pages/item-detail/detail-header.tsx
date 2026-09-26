import { ChevronRight, MapPin, Package } from 'lucide-react';
import Markdown from 'react-markdown';
import { Link } from 'react-router';
import rehypeSanitize from 'rehype-sanitize';

import { Badge, PageHeader, TypeBadge } from '@pops/ui';

import type { ReactNode } from 'react';

import type { ItemDetailAggregate, LocationNode } from '../../foundation/item-page';

function LocationBreadcrumb({
  locationId,
  locationPath,
}: {
  locationId: string | null;
  locationPath: readonly LocationNode[];
}) {
  const content = locationContent(locationId, locationPath);
  return (
    <div
      className="mb-4 flex min-w-0 items-center gap-1.5 text-sm"
      data-testid="location-breadcrumb"
    >
      <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {content}
    </div>
  );
}

function locationContent(
  locationId: string | null,
  locationPath: readonly LocationNode[]
): ReactNode {
  if (locationId === null)
    return <span className="text-muted-foreground">No location assigned</span>;
  if (locationPath.length === 0) {
    return <span className="text-muted-foreground">Location assigned</span>;
  }
  return locationPath.map((location, index) => (
    <span key={location.id} className="flex min-w-0 items-center gap-1.5">
      {index > 0 ? <ChevronRight className="size-3 shrink-0 text-muted-foreground" /> : null}
      <Link
        to={`/inventory/items?location=${location.id}`}
        className="truncate font-medium text-app-accent hover:underline"
      >
        {location.name}
      </Link>
    </span>
  ));
}

function LifecycleBadge({ lifecycle }: { lifecycle: ItemDetailAggregate['lifecycle'] }) {
  if (lifecycle === 'active') return <Badge variant="secondary">Active</Badge>;
  return <Badge variant={lifecycle === 'destroyed' ? 'destructive' : 'outline'}>{lifecycle}</Badge>;
}

function ItemTitle({ detail }: { detail: ItemDetailAggregate }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-app-accent/15 text-app-accent">
        {detail.isContainer ? (
          <Package className="size-6" aria-hidden />
        ) : (
          <Package className="size-6" aria-hidden />
        )}
      </span>
      <div className="min-w-0">
        <span className="block truncate text-2xl font-extrabold tracking-tight md:text-3xl">
          {detail.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 pt-1">
          <LifecycleBadge lifecycle={detail.lifecycle} />
          {detail.legacyItem.type ? <TypeBadge type={detail.legacyItem.type} /> : null}
        </span>
      </div>
    </div>
  );
}

/** Renders the route-compatible header and location metadata for an item. */
export function DetailHeader({
  detail,
  locationPath,
  actions,
}: {
  detail: ItemDetailAggregate;
  locationPath: readonly LocationNode[];
  actions: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={<ItemTitle detail={detail} />}
        backHref="/inventory/items"
        breadcrumbs={[{ label: 'Inventory', href: '/inventory/items' }, { label: detail.name }]}
        actions={actions}
        renderLink={Link}
        className="mb-3"
      />
      <LocationBreadcrumb locationId={detail.legacyItem.locationId} locationPath={locationPath} />
      {detail.note ? (
        <section className="mb-4" aria-label="Notes">
          <h2 className="mb-2 text-sm font-semibold">Notes</h2>
          <div className="prose prose-sm max-w-none text-muted-foreground dark:prose-invert">
            <Markdown rehypePlugins={[rehypeSanitize]}>{detail.note}</Markdown>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** Renders the lifecycle notice that explains why an inactive item is read-only. */
export function LifecycleNotice({ detail }: { detail: ItemDetailAggregate }) {
  if (detail.lifecycle === 'active') return null;
  return (
    <div className="mb-4 rounded-lg border bg-card px-3 py-2 text-sm" role="status">
      <p className="font-medium">This item is {detail.lifecycle}.</p>
      <p className="text-xs text-muted-foreground">
        {detail.readOnly
          ? 'Destroyed items are preserved for history and cannot be changed.'
          : 'The item remains in the record while its lifecycle state is inactive.'}
      </p>
    </div>
  );
}
