import { createdOnlyHistory, televisionHistory } from '@/fixtures/inventory/item-history';
import {
  ItemDetailSkeleton,
  ItemDetailProblem,
} from '@/kit/inventory/item-detail/detail-fallbacks';
import { ItemHistoryPage } from '@/kit/inventory/item-detail/history/history-page';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Item history', order: 3, frame: 'web' };

const openEvent = televisionHistory[0]?.id ?? null;

/**
 * `/inventory/items/:id/history`: one item's full history, by month, with
 * kind filters, event detail beside the list and Undo where it applies.
 */
export const states: ScreenStates = {
  filtered: () => (
    <ItemHistoryPage itemName="Television" events={televisionHistory} initialFilter="placement" />
  ),
  'event-detail': () => (
    <ItemHistoryPage itemName="Television" events={televisionHistory} initialOpenId={openEvent} />
  ),
  'undo-conflict': () => (
    <ItemHistoryPage
      itemName="Television"
      events={televisionHistory}
      initialToast={{ concept: 'undo', message: 'Manufacturer changed', state: 'conflict' }}
    />
  ),
  empty: () => <ItemHistoryPage itemName="Step ladder" events={createdOnlyHistory} />,
  'empty-filtered': () => (
    <ItemHistoryPage itemName="Step ladder" events={createdOnlyHistory} initialFilter="lifecycle" />
  ),
  loading: () => <ItemDetailSkeleton />,
  error: () => <ItemDetailProblem variant="error" />,
};

export default function ItemHistoryScreen() {
  return <ItemHistoryPage itemName="Television" events={televisionHistory} />;
}
