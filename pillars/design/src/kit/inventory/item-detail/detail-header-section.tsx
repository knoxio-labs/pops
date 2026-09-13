import { ChevronRight, ExternalLink, MapPin, Store } from 'lucide-react';

import { Skeleton } from '@pops/ui';

import { DetailGrid } from './detail-grid';

import type { LocationSegmentFixture } from '@/fixtures/inventory-locations';
import type { ReactNode } from 'react';

import type { DetailHeaderItem } from './detail-header-item';

/**
 * Every Link in the source becomes a plain anchor whose click calls
 * `onNavigate` with the href it would have carried, since the canvas
 * renders inside an iframe and a real navigation would leave the surface.
 */
function NavAnchor({
  href,
  className,
  onNavigate,
  children,
}: {
  href: string;
  className?: string;
  onNavigate: (path: string) => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(href);
      }}
    >
      {children}
    </a>
  );
}

function LocationBreadcrumb({
  locationId,
  locationPath,
  onNavigate,
}: {
  locationId: string | null;
  locationPath: LocationSegmentFixture[] | null;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="mb-8 flex items-center gap-1.5 text-sm" data-testid="location-breadcrumb">
      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
      {(() => {
        if (!locationId) return <span className="text-muted-foreground">No location assigned</span>;
        if (!locationPath) return <Skeleton className="h-4 w-32" />;
        return locationPath.map((loc, i) => (
          <span key={loc.id} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <NavAnchor
              href={`/inventory?location=${loc.id}`}
              className="text-app-accent hover:text-app-accent/80 hover:underline font-medium"
              onNavigate={onNavigate}
            >
              {loc.name}
            </NavAnchor>
          </span>
        ));
      })()}
    </div>
  );
}

function PurchaseLinkSection({
  purchaseTransactionId,
  purchasedFromId,
  purchasedFromName,
  onNavigate,
}: {
  purchaseTransactionId: string | null;
  purchasedFromId: string | null;
  purchasedFromName: string | null;
  onNavigate: (path: string) => void;
}) {
  if (!purchaseTransactionId && !purchasedFromId) return null;
  return (
    <div className="mb-8 flex items-center gap-4 text-sm" data-testid="purchase-link-section">
      {purchaseTransactionId && (
        <NavAnchor
          href={`/finance/transactions/${purchaseTransactionId}`}
          className="flex items-center gap-1.5 text-app-accent hover:text-app-accent/80 hover:underline font-medium"
          onNavigate={onNavigate}
        >
          <ExternalLink className="h-4 w-4" />
          View transaction
        </NavAnchor>
      )}
      {purchasedFromId && purchasedFromName && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Store className="h-4 w-4" />
          {purchasedFromName}
        </span>
      )}
    </div>
  );
}

export { type DetailHeaderItem } from './detail-header-item';

interface DetailHeaderSectionProps {
  item: DetailHeaderItem;
  locationPath: LocationSegmentFixture[] | null;
  /**
   * Called with the path a link in this section would have navigated to.
   * Defaults to a no-op; see `NavAnchor` above for why.
   */
  onNavigate?: (path: string) => void;
}

/**
 * The source renders `notes` through `react-markdown` + `rehype-sanitize`.
 * Neither is a dependency of `@pops/design`, and adding one is outside the
 * files this port owns, so notes render as plain text: the wrapper and its
 * classes are unchanged, only the markdown parse is missing.
 */
function NotesPanel({ notes }: { notes: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-2">Notes</h2>
      <div className="text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
        <p>{notes}</p>
      </div>
    </div>
  );
}

export function DetailHeaderSection({
  item,
  locationPath,
  onNavigate = () => {},
}: DetailHeaderSectionProps) {
  return (
    <>
      <DetailGrid item={item} />
      <LocationBreadcrumb
        locationId={item.locationId ?? null}
        locationPath={locationPath}
        onNavigate={onNavigate}
      />
      <PurchaseLinkSection
        purchaseTransactionId={item.purchaseTransactionId ?? null}
        purchasedFromId={item.purchasedFromId ?? null}
        purchasedFromName={item.purchasedFromName ?? null}
        onNavigate={onNavigate}
      />
      {item.notes && <NotesPanel notes={item.notes} />}
    </>
  );
}
