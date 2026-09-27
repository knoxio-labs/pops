import { PackageSearch } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Skeleton } from '@pops/ui';

import { usePurchasePreview } from '../../inventory-web/usePurchasePreview.js';
import { ItemPreview } from './item-preview.js';
import { PlacePreview } from './place-preview.js';
import { PreviewFrame } from './preview-parts.js';
import { PurchasePreview } from './purchase-preview.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SearchScope } from './search-model.js';

/** Props for the responsive split preview and mobile sheet content. */
export interface ActivePreviewProps {
  readonly scope: SearchScope;
  readonly activeId: string | null;
  readonly item: ItemRowModel | null;
  readonly place: LocationModel | null;
  readonly world: PlacementWorld;
  readonly onOpen: () => void;
  readonly onPickUp: () => void;
  readonly onPutBack: () => void;
  readonly onMove: () => void;
  readonly onOpenPlace: () => void;
  readonly onStoreHere: () => void;
  readonly onOpenPurchase: () => void;
}

function PurchasePreviewState({
  id,
  world,
  onOpen,
}: {
  readonly id: string;
  readonly world: PlacementWorld;
  readonly onOpen: () => void;
}) {
  const preview = usePurchasePreview(id);
  if (preview.status === 'pending') {
    return (
      <div role="status" aria-label="Loading purchase preview" className="space-y-4 px-5 py-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (preview.status === 'error') {
    return (
      <Alert variant="destructive" className="m-5">
        <AlertTitle>Purchase preview did not load</AlertTitle>
        <AlertDescription>The purchases service did not answer.</AlertDescription>
      </Alert>
    );
  }
  if (preview.purchase === null) {
    return (
      <Alert className="m-5">
        <AlertTitle>Purchase unavailable</AlertTitle>
        <AlertDescription>This purchase is no longer available.</AlertDescription>
      </Alert>
    );
  }
  return <PurchasePreview purchase={preview.purchase} world={world} onOpen={onOpen} />;
}

/** Chooses the item, place, or purchase preview for the active result. */
export function ActivePreview({
  scope,
  activeId,
  item,
  place,
  world,
  onOpen,
  onPickUp,
  onPutBack,
  onMove,
  onOpenPlace,
  onStoreHere,
  onOpenPurchase,
}: ActivePreviewProps) {
  if (activeId === null) {
    return (
      <PreviewFrame title="Search preview">
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <PackageSearch className="size-8" aria-hidden />
          <p className="text-sm">Select a result to preview it here.</p>
        </div>
      </PreviewFrame>
    );
  }
  if (scope === 'purchases') {
    return <PurchasePreviewState id={activeId} world={world} onOpen={onOpenPurchase} />;
  }
  if (item !== null) {
    return (
      <ItemPreview
        item={item}
        world={world}
        onOpen={onOpen}
        onPickUp={onPickUp}
        onPutBack={onPutBack}
        onMove={onMove}
      />
    );
  }
  if (place !== null) {
    return (
      <PlacePreview place={place} world={world} onOpen={onOpenPlace} onStoreHere={onStoreHere} />
    );
  }
  return (
    <Alert className="m-5">
      <AlertTitle>Preview unavailable</AlertTitle>
      <AlertDescription>
        The selected result is no longer in the current result set.
      </AlertDescription>
    </Alert>
  );
}
