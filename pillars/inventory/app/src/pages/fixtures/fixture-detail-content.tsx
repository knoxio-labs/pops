import { Cable } from 'lucide-react';

import { Button } from '@pops/ui';

import { OFFLINE_REASON, StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { FixtureFacts } from './fixture-facts.js';
import { FixtureFormDialog } from './fixture-form-dialog.js';
import { fixtureKindIcon, fixtureKindLabel } from './fixture-kinds.js';
import { FixtureWiredItems } from './fixture-wired-items.js';
import { WireItemsSheet } from './wire-items-sheet.js';

import type { ReactElement } from 'react';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { useFixtureDetailActions } from './fixture-detail-actions.js';
import type { FixtureDetail } from './fixture-model.js';
import type { useFixtureDetailPageModel } from './fixtures-page-model.js';

/** The composed data model consumed by the fixture detail view. */
export type FixtureDetailModel = ReturnType<typeof useFixtureDetailPageModel>;

/** The guarded mutations and selection actions for the fixture detail view. */
export type FixtureDetailActions = ReturnType<typeof useFixtureDetailActions>;

/** The controls shared by loaded and transitional fixture detail frames. */
export interface FixtureDetailControls {
  readonly selection: SelectionApi;
  readonly wiredIds: ReadonlySet<string>;
  readonly editOpen: boolean;
  readonly wireOpen: boolean;
  readonly onEditOpenChange: (open: boolean) => void;
  readonly onWireOpenChange: (open: boolean) => void;
  readonly actions: FixtureDetailActions;
  readonly onOpenItem: (id: string) => void;
}

/** The complete fixture detail model required once the fixture has loaded. */
export interface FixtureDetailLoadedProps extends FixtureDetailControls {
  readonly model: FixtureDetailModel;
  readonly fixture: FixtureDetail;
}

/** Renders the stale-data notice for the fixture and its connections. */
export function staleBanner(model: FixtureDetailModel): ReactElement | null {
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

/** Renders the guarded fixture wiring action. */
export function WireButton({
  online,
  onOpen,
}: {
  online: boolean;
  onOpen: () => void;
}): ReactElement {
  const disabledReason = online ? undefined : OFFLINE_REASON;
  return (
    <HintTooltip label="Wire items to this fixture" disabledReason={disabledReason}>
      <Button
        disabled={!online}
        aria-disabled={!online || undefined}
        onClick={online ? onOpen : undefined}
        prefix={<Cable className="size-4" aria-hidden />}
      >
        Wire items
      </Button>
    </HintTooltip>
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
}: FixtureDetailLoadedProps): ReactElement {
  let locationsStatus: 'pending' | 'error' | 'success' = 'success';
  if (model.placement.isError) locationsStatus = 'error';
  else if (model.placement.isLoading) locationsStatus = 'pending';
  return (
    <>
      <FixtureFormDialog
        open={editOpen}
        onOpenChange={onEditOpenChange}
        locations={model.placement.locations}
        locationsStatus={locationsStatus}
        onRetryLocations={model.retryLocations}
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
  onOpenItem,
  onEdit,
  onWire,
}: FixtureDetailLoadedProps & {
  readonly onEdit: () => void;
  readonly onWire: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <FixtureFacts
        fixture={fixture}
        locations={model.placement.locations}
        editDisabledReason={model.online ? undefined : OFFLINE_REASON}
        onEdit={onEdit}
      />
      <FixtureWiredItems
        fixtureName={fixture.name}
        items={model.items.items}
        total={model.items.total}
        status={model.items.status}
        world={model.placement.world}
        selection={selection}
        online={model.online}
        disconnectingIds={actions.disconnectingIds}
        onOpen={onOpenItem}
        onWire={onWire}
        onDisconnect={actions.disconnect}
        onRetry={model.retryItems}
      />
    </div>
  );
}

/** Builds the loaded fixture description from its kind and resolved room. */
export function fixtureDescription(fixture: FixtureDetail, model: FixtureDetailModel): string {
  return `${fixtureKindLabel(fixture.type)} in ${
    model.placement.world.locations.get(fixture.locationId ?? '')?.name ?? 'an unknown place'
  }`;
}

/** Renders the loaded fixture frame and its facts and wired-item content. */
export function FixtureDetailLoaded(props: FixtureDetailLoadedProps): ReactElement {
  const { model, fixture, onOpenItem } = props;
  return (
    <InventoryPage
      title={fixture.name}
      icon={fixtureKindIcon(fixture.type)}
      description={fixtureDescription(fixture, model)}
      breadcrumbs={[
        { label: 'Connections', href: '/inventory/connections' },
        { label: 'Fixtures', href: '/inventory/connections/fixtures' },
        { label: fixture.name },
      ]}
      actions={<WireButton online={model.online} onOpen={() => props.onWireOpenChange(true)} />}
      banner={!model.online ? <OfflineBanner /> : staleBanner(model)}
      bodyClassName="gap-4"
      overlay={<FixtureDetailOverlay {...props} />}
    >
      <FixtureDetailBody
        {...props}
        onEdit={() => props.onEditOpenChange(true)}
        onOpenItem={onOpenItem}
        onWire={() => props.onWireOpenChange(true)}
      />
    </InventoryPage>
  );
}
