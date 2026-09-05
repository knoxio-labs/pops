import { PopsButton, PopsCard } from '@/frames/ios/primitives';

/**
 * The two things a transactions list shows beside its rows: a failure that
 * sits *over* rows already on screen rather than replacing them, and the
 * footer that fetches the next page by appearing.
 *
 * Both are kit rather than screen because the detail screen shows the same
 * banner, and two copies of "a failure never takes the data away" is the one
 * rule worth keeping in a single place.
 */
export function FailureBanner({ lead, message }: { lead: string; message: string }) {
  return (
    <PopsCard>
      <div className="space-y-3">
        <p className="ios-body" style={{ color: 'var(--ios-destructive)' }}>
          {lead} {message}
        </p>
        <PopsButton>Retry</PopsButton>
      </div>
    </PopsCard>
  );
}

/**
 * `exhausted` draws nothing — the server has said there is no next page, and
 * a footer that stays behind is a promise of more that will never arrive.
 * `idle` and `loading` draw the same line, because appearing is what starts
 * the fetch: there is no moment where one is true and the other is not.
 */
export type Paging = 'idle' | 'loading' | 'exhausted' | { failure: string };

export function PagingFooter({ state }: { state: Paging }) {
  if (state === 'exhausted') return null;
  if (typeof state === 'object') {
    return (
      <div className="space-y-3 py-4">
        <p className="ios-body text-center" style={{ color: 'var(--ios-destructive)' }}>
          Could not load more. {state.failure}
        </p>
        <div className="flex justify-center">
          <PopsButton>Retry</PopsButton>
        </div>
      </div>
    );
  }
  return (
    <p className="ios-body py-4 text-center" style={{ color: 'var(--ios-muted-foreground)' }}>
      Loading more…
    </p>
  );
}
