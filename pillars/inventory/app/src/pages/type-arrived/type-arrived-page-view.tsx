import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { ListError } from '../../foundation/list-page/list-states.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { describeArrival, toArrivedType } from './type-arrived-model.js';
import {
  ApplyShortcut,
  TypeArrivedBody,
  TypeArrivedReviewActions,
} from './type-arrived-page-content.js';
import { useTypeArrivedActions, useTypeArrivedData } from './type-arrived-page-state.js';

import type { ReactElement } from 'react';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

function TypeArrivedError({
  typeName,
  onRetry,
}: {
  typeName: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <InventoryPage
      title={`New type: ${typeName}`}
      icon={INVENTORY_ICONS.type}
      breadcrumbs={[{ label: 'Types', href: '/inventory/types' }, { label: typeName }]}
    >
      <ListError noun="items" onRetry={onRetry} />
    </InventoryPage>
  );
}

/** Renders the server-backed Type arrived review and its outcomes. */
export function TypeArrivedPageView({ type }: { type: CatalogueType }): ReactElement {
  const navigate = useNavigate();
  const arrivedType = useMemo(() => toArrivedType(type), [type]);
  const data = useTypeArrivedData(arrivedType);
  const actions = useTypeArrivedActions(arrivedType, data.matchIds, data.ticked, data.setTicked);
  const reviewing = actions.stage === 'review' && data.ready && data.matches.length > 0;
  const description = describeArrival(
    actions.stage,
    arrivedType,
    data.matches.length,
    data.ticked.size
  );

  if (data.itemQuery.status === 'error') {
    return <TypeArrivedError typeName={arrivedType.name} onRetry={data.retry} />;
  }
  return (
    <InventoryPage
      title={`New type: ${arrivedType.name}`}
      icon={INVENTORY_ICONS.type}
      description={description}
      breadcrumbs={[{ label: 'Types', href: '/inventory/types' }, { label: arrivedType.name }]}
      actions={
        reviewing ? (
          <TypeArrivedReviewActions
            count={data.ticked.size}
            applying={actions.applying}
            onNotNow={actions.onNotNow}
            onApply={() => void actions.apply()}
          />
        ) : undefined
      }
      bodyClassName="gap-3"
    >
      {actions.applyError !== null ? (
        <p role="alert" className="text-sm text-warning">
          {actions.applyError}
        </p>
      ) : null}
      {reviewing && data.ticked.size > 0 ? (
        <ApplyShortcut onApply={() => void actions.apply()} />
      ) : null}
      <TypeArrivedBody
        stage={actions.stage}
        ready={data.ready}
        type={arrivedType}
        matches={data.matches}
        world={data.placement.world}
        ticked={data.ticked}
        appliedIds={actions.appliedIds}
        matchIds={data.matchIds}
        toggle={actions.toggle}
        navigate={navigate}
      />
    </InventoryPage>
  );
}
