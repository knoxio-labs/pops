import { useMemo, type ReactElement } from 'react';

import { usePurchasePreview } from '../../inventory-web/usePurchasePreview.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { PurchaseStatePreview, PurchaseSummary } from './purchase-preview-content.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseResult } from '../../inventory-web/purchase-model.js';

const EMPTY_ITEM_FILTER = 'purchase-preview-empty';

/** Props for the read-only purchase preview. */
export interface PurchasePreviewProps {
  purchaseId: string;
  currency: string;
  onOpenInPurchases: () => void;
}

type LegacyPurchasePreviewProps = {
  purchase: PurchaseResult;
  world: PlacementWorld;
  onOpen: () => void;
};

function LoadedPurchasePreview({
  purchase,
  currency,
  onOpenInPurchases,
}: {
  purchase: PurchaseResult;
  currency: string;
  onOpenInPurchases: () => void;
}): ReactElement {
  const itemIds = useMemo(
    () => purchase.lines.flatMap((line) => (line.itemId === undefined ? [] : [line.itemId])),
    [purchase.lines]
  );
  const itemRows = useItemRows(
    {
      ids: itemIds.length === 0 ? EMPTY_ITEM_FILTER : itemIds.join(','),
      includeInactive: true,
    },
    Math.max(itemIds.length, 1)
  );
  const items = useMemo(
    () => new Map(itemRows.rows.map((item) => [item.id, item] as const)),
    [itemRows.rows]
  );
  return (
    <PurchaseSummary
      purchase={purchase}
      currency={currency}
      items={items}
      onOpenInPurchases={onOpenInPurchases}
    />
  );
}

function PurchasePreviewState({
  purchaseId,
  currency,
  onOpenInPurchases,
}: PurchasePreviewProps): ReactElement {
  const preview = usePurchasePreview(purchaseId);
  if (preview.status === 'pending') {
    return <PurchaseStatePreview error={false} onOpenInPurchases={onOpenInPurchases} />;
  }
  if (preview.status !== 'success' || preview.purchase === null) {
    return <PurchaseStatePreview error onOpenInPurchases={onOpenInPurchases} />;
  }
  return (
    <LoadedPurchasePreview
      purchase={preview.purchase}
      currency={currency}
      onOpenInPurchases={onOpenInPurchases}
    />
  );
}

function LegacyPurchasePreview({
  purchase,
  world,
  onOpen,
}: LegacyPurchasePreviewProps): ReactElement {
  return (
    <PurchaseSummary
      purchase={purchase}
      currency="AUD"
      items={world.items}
      onOpenInPurchases={onOpen}
    />
  );
}

/** Renders a read-only purchase summary and resolves tracked inventory lines. */
export function PurchasePreview(props: PurchasePreviewProps): ReactElement;
export function PurchasePreview(props: LegacyPurchasePreviewProps): ReactElement;
export function PurchasePreview(
  props: PurchasePreviewProps | LegacyPurchasePreviewProps
): ReactElement {
  return 'purchaseId' in props ? (
    <PurchasePreviewState {...props} />
  ) : (
    <LegacyPurchasePreview {...props} />
  );
}
