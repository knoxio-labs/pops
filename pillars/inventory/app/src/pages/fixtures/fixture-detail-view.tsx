import { Cable } from 'lucide-react';

import { Button } from '@pops/ui';

import { OFFLINE_REASON, StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
import { isNotFoundError } from '../../inventory-api-helpers.js';
import { FixtureFacts } from './fixture-facts.js';
import { FixtureFormDialog } from './fixture-form-dialog.js';
import { fixtureKindIcon } from './fixture-kinds.js';
import { FixtureDetailLoading, FixtureDetailProblem } from './fixture-states.js';
import { FixtureWiredItems } from './fixture-wired-items.js';
import { WireItemsSheet } from './wire-items-sheet.js';

import type { ReactElement } from 'react';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { useFixtureDetailActions } from './fixture-detail-actions.js';
import type { FixtureDetail } from './fixture-model.js';
import type { useFixtureDetailPageModel } from './fixtures-page-model.js';

type FixtureDetailModel = ReturnType<typeof useFixtureDetailPageModel>;
type FixtureDetailActions = ReturnType<typeof useFixtureDetailActions>;

interface FixtureDetailControls {
  readonly selection: SelectionApi;
  readonly wiredIds: ReadonlySet<string>;
  readonly editOpen: boolean;
  readonly wireOpen: boolean;
  readonly onEditOpenChange: (open: boolean) => void;
  readonly onWireOpenChange: (open: boolean) => void;
  readonly actions: FixtureDetailActions;
  readonly onOpenItem: (id: string) => void;
}

interface FixtureDetailLoadedProps extends FixtureDetailControls {
  readonly model: FixtureDetailModel;
  readonly fixture: FixtureDetail;
}

function staleBanner(model: FixtureDetailModel): ReactElement | null {
  if (!model.changed.stale) return null;
  return (
    <StateBanner
      kind="stale"
      title="This fixture changed elsewhere since it loaded"
      detail="Reload to see the latest facts and wired items."
      actionLabel="Reload"
      onAction={() => void model.changed.reload()}
    />
  );
}

function FixtureDetailOverlay({
  model,
  fixture,
  actions,
  editOpen,
  wireOpen,
  onEditOpenChange,
  onWireOpenChange,
  wiredIds,
}: Pick<
  FixtureDetailLoadedProps,
  | 'model'
  | 'fixture'
  | 'actions'
  | 'editOpen'
  | 'wireOpen'
  | 'onEditOpenChange'
  | 'onWireOpenChange'
  | 'wiredIds'
>): ReactElement {
  return (
    <>
      <FixtureFormDialog
        open={editOpen}
        onOpenChange={onEditOpenChange}
        locations={model.locations.locations}
        fixture={fixture}
        disabledReason={model.online ? undefined : OFFLINE_REASON}
        onSave={actions.save}
      />
      <WireItemsSheet
        open={wireOpen}
        onOpenChange={onWireOpenChange}
        fixture={fixture}
        wiredIds={wiredIds}
        online={model.online}
        onWire={actions.wire}
      />
    </>
  );
}

function FixtureDetailBody({
  model,
  fixture,
  selection,
  actions,
  onEdit,
  onOpenItem,
  onWire,
}: Pick<FixtureDetailLoadedProps, 'model' | 'fixture' | 'selection' | 'actions' | 'onOpenItem'> & {
  readonly onEdit: () => void;
  readonly onWire: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <FixtureFacts
        fixture={fixture}
        locations={model.locations.locations}
        editDisabledReason={model.online ? undefined : OFFLINE_REASON}
        onEdit={onEdit}
      />
      <FixtureWiredItems
        fixtureName={fixture.name}
        items={model.items.items}
        locations={model.locations.locations}
        selection={selection}
        online={model.online}
        disconnectingIds={actions.disconnectingIds}
        hasNextPage={model.items.hasNextPage}
        onLoadMore={model.items.fetchNextPage}
        onOpen={onOpenItem}
        onWire={onWire}
        onDisconnect={actions.disconnect}
      />
    </div>
  );
}

function FixtureDetailLoaded(props: FixtureDetailLoadedProps): ReactElement {
  const { model, fixture, selection, actions, onOpenItem } = props;
  const icon = fixtureKindIcon(fixture.type);
  const breadcrumbs = [
    { label: 'Fixtures', href: '/inventory/connections/fixtures' },
    { label: fixture.name },
  ];
  return (
    <InventoryPage
      title={fixture.name}
      icon={icon}
      breadcrumbs={breadcrumbs}
      banner={!model.online ? <OfflineBanner /> : staleBanner(model)}
      actions={
        <Button
          variant="outline"
          disabled={!model.online}
          aria-disabled={!model.online || undefined}
          title={!model.online ? OFFLINE_REASON : undefined}
          onClick={model.online ? () => props.onEditOpenChange(true) : undefined}
        >
          Edit fixture
        </Button>
      }
      bodyClassName="gap-4"
      overlay={<FixtureDetailOverlay {...props} />}
    >
      <FixtureDetailBody
        model={model}
        fixture={fixture}
        selection={selection}
        actions={actions}
        onEdit={() => props.onEditOpenChange(true)}
        onOpenItem={onOpenItem}
        onWire={() => props.onWireOpenChange(true)}
      />
    </InventoryPage>
  );
}

/** Renders the detail page state and loaded fixture view for one route id. */
export function FixtureDetailView({
  model,
  ...controls
}: { readonly model: FixtureDetailModel } & FixtureDetailControls): ReactElement {
  const fixture = model.fixture;
  const title = fixture?.name ?? 'Fixture';
  const icon = fixture === undefined ? Cable : fixtureKindIcon(fixture.type);
  const breadcrumbs = [
    { label: 'Fixtures', href: '/inventory/connections/fixtures' },
    { label: title },
  ];
  const banner = !model.online ? <OfflineBanner /> : staleBanner(model);
  if (model.status === 'pending') {
    return (
      <InventoryPage title={title} icon={icon} breadcrumbs={breadcrumbs} banner={banner}>
        <FixtureDetailLoading />
      </InventoryPage>
    );
  }
  if (model.status === 'error' || fixture === undefined) {
    return (
      <InventoryPage title={title} icon={icon} breadcrumbs={breadcrumbs} banner={banner}>
        <FixtureDetailProblem
          variant={isNotFoundError(model.error) || fixture === undefined ? 'not-found' : 'error'}
          error={model.error}
          onRetry={model.refetch}
        />
      </InventoryPage>
    );
  }
  return <FixtureDetailLoaded model={model} fixture={fixture} {...controls} />;
}
