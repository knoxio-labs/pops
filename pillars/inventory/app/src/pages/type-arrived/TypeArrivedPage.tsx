import { Navigate, useParams } from 'react-router';

import { Skeleton } from '@pops/ui';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { ListError } from '../../foundation/list-page/list-states.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { usePublishedCatalogue } from '../../inventory-web/useCatalogueLookups.js';
import { TypeArrivedPageView } from './type-arrived-page-view.js';

import type { ReactElement } from 'react';

function TypeArrivedLoading(): ReactElement {
  return (
    <InventoryPage title="New type" icon={INVENTORY_ICONS.type}>
      <Skeleton className="h-72 w-full rounded-lg" />
    </InventoryPage>
  );
}

function TypeArrivedCatalogueError({ onRetry }: { onRetry: () => void }): ReactElement {
  return (
    <InventoryPage title="Type arrived" icon={INVENTORY_ICONS.type}>
      <ListError noun="types" onRetry={onRetry} />
    </InventoryPage>
  );
}

/** Renders the revision-aware review page for one published inventory type. */
export function TypeArrivedPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const catalogue = usePublishedCatalogue();
  const type = catalogue.types.find((candidate) => candidate.id === id);

  if (catalogue.isPending) return <TypeArrivedLoading />;
  if (catalogue.error !== null) {
    return <TypeArrivedCatalogueError onRetry={catalogue.refetch} />;
  }
  if (type === undefined) return <Navigate to="/inventory/types" replace />;
  return <TypeArrivedPageView type={type} />;
}
