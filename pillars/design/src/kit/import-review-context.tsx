import { LiveArrivals } from '@/kit/live-arrivals-banner';
import { ImportContextStrip } from '@/screens/finance/import/upload';

import type { ImportChoice } from '@/screens/finance/import/context';

/**
 * What sits above every shape of the review: the account-and-source strip,
 * and, for a live feed, the banner for rows that arrived after the import
 * was opened. Shared by the flow's Review step and the review-density
 * variants so the three are compared on the same header.
 */
export function ImportReviewContext({
  choice,
  liveArrivals,
}: {
  choice: ImportChoice;
  liveArrivals?: number;
}) {
  return (
    <div className="mb-4 space-y-4">
      <ImportContextStrip choice={choice} />
      {liveArrivals !== undefined && <LiveArrivals count={liveArrivals} />}
    </div>
  );
}
