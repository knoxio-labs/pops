import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';

import { Button, Skeleton } from '@pops/ui';

export function WarrantySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-16">
      <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground mb-4">Could not load warranties — try again</p>
      <Button onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

/**
 * `onBrowseItems` replaces the source's `<Link to="/inventory/items">`: the
 * canvas renders inside an iframe, so a real route navigation would leave the
 * design surface rather than move within it.
 */
export function EmptyState({ onBrowseItems = () => {} }: { onBrowseItems?: () => void }) {
  return (
    <div className="text-center py-16">
      <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground mb-4">
        No items with warranty dates. Add warranty expiry dates to your inventory items to track
        them here.
      </p>
      <button
        type="button"
        onClick={onBrowseItems}
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Browse Items
      </button>
    </div>
  );
}
