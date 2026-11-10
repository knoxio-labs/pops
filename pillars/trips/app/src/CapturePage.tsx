import { Link, useNavigate, useParams } from 'react-router';

import { CaptureWorkspace } from '@pops/trips-workspace';
import { Button, ErrorState } from '@pops/ui';

import { navConfig } from './nav';
import { sourceId } from './source-id';

import type { JSX } from 'react';

import type { RemotePageHostProps } from '@pops/pillar-sdk';

/** Mount a source-backed Capture surface for one real owning trip identity. */
export function CapturePage({
  view,
  contacts,
}: RemotePageHostProps & { view: 'capture' | 'inbox' | 'explore' }): JSX.Element {
  const tripId = sourceId(useParams().tripId);
  const navigate = useNavigate();
  return tripId === undefined ? (
    <ErrorState
      error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
    />
  ) : (
    <CaptureWorkspace
      tripId={tripId}
      contacts={contacts}
      view={view}
      backHref={navConfig.basePath}
      renderLink={Link}
      navigation={<CaptureNavigation tripId={tripId} view={view} />}
      onViewEvent={(eventId) => navigate(`${navConfig.basePath}/${tripId}/events/${eventId}`)}
    />
  );
}
function CaptureNavigation({
  tripId,
  view,
}: {
  tripId: number;
  view: 'capture' | 'inbox' | 'explore';
}): JSX.Element {
  return (
    <nav aria-label="Capture views" className="flex flex-wrap gap-2">
      <Button asChild variant={view === 'capture' ? 'secondary' : 'ghost'}>
        <Link
          to={`${navConfig.basePath}/${tripId}/capture`}
          aria-current={view === 'capture' ? 'page' : undefined}
        >
          Capture
        </Link>
      </Button>
      <Button asChild variant={view === 'inbox' ? 'secondary' : 'ghost'}>
        <Link
          to={`${navConfig.basePath}/${tripId}/inbox`}
          aria-current={view === 'inbox' ? 'page' : undefined}
        >
          Inbox
        </Link>
      </Button>
      <Button asChild variant={view === 'explore' ? 'secondary' : 'ghost'}>
        <Link
          to={`${navConfig.basePath}/${tripId}/explore`}
          aria-current={view === 'explore' ? 'page' : undefined}
        >
          Explore
        </Link>
      </Button>
    </nav>
  );
}

/** Route adapter for the approved text-first Capture surface. */
export function CaptureHomePage(props: RemotePageHostProps): JSX.Element {
  return <CapturePage {...props} view="capture" />;
}

/** Route adapter for the approved inline source Inbox. */
export function InboxPage(props: RemotePageHostProps): JSX.Element {
  return <CapturePage {...props} view="inbox" />;
}

/** Route adapter for saved possibilities grouped by their recorded location. */
export function ExplorePage(props: RemotePageHostProps): JSX.Element {
  return <CapturePage {...props} view="explore" />;
}
