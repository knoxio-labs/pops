import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

import { Skeleton } from '@pops/ui';

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

export function EmptyState() {
  return (
    <div className="text-center py-16">
      <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground mb-4">
        No items with warranty dates. Add warranty expiry dates to your inventory items to track
        them here.
      </p>
      <Link
        to="/inventory/items"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Browse Items
      </Link>
    </div>
  );
}
