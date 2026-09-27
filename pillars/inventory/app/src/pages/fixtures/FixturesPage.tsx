import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { OFFLINE_REASON, StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { FixtureFormDialog } from './fixture-form-dialog.js';
import { FixturesList } from './fixtures-list.js';
import { useFixturesPageModel } from './fixtures-page-model.js';

import type { ReactElement } from 'react';

import type { FixtureFilter } from './fixture-filter.js';
import type { FixtureFormDialogProps } from './fixture-form-types.js';
import type { FixtureListRow } from './fixture-model.js';

function staleBanner(model: ReturnType<typeof useFixturesPageModel>): ReactElement | null {
  if (!model.changed.stale) return null;
  return (
    <StateBanner
      kind="stale"
      title="Fixtures changed elsewhere since this page loaded"
      detail="The list stays as it is while you inspect it. Reload to see the changes."
      actionLabel="Reload"
      onAction={() => void model.changed.reload()}
    />
  );
}

function NewFixtureButton({ online, onNew }: { online: boolean; onNew: () => void }): ReactElement {
  const button = (
    <Button
      disabled={!online}
      aria-disabled={!online || undefined}
      onClick={online ? onNew : undefined}
      prefix={<Plus className="size-4" aria-hidden />}
    >
      New fixture
    </Button>
  );
  return (
    <HintTooltip label="Record a fixture" disabledReason={!online ? OFFLINE_REASON : undefined}>
      {button}
    </HintTooltip>
  );
}

function ConnectionsTabs(): ReactElement {
  const navigate = useNavigate();
  return (
    <Tabs
      value="fixtures"
      onValueChange={(value) => {
        if (value === 'connections') void navigate('/inventory/connections');
      }}
    >
      <TabsList aria-label="Connections and fixtures">
        <TabsTrigger value="connections">Connections</TabsTrigger>
        <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function FixtureOverlay({
  model,
  formOpen,
  editing,
  onOpenChange,
  onSave,
}: {
  readonly model: ReturnType<typeof useFixturesPageModel>;
  readonly formOpen: boolean;
  readonly editing: FixtureListRow | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: FixtureFormDialogProps['onSave'];
}): ReactElement {
  return (
    <FixtureFormDialog
      open={formOpen}
      onOpenChange={onOpenChange}
      locations={model.locations.locations}
      locationsStatus={model.locations.status}
      onRetryLocations={model.retryLocations}
      fixture={editing}
      disabledReason={model.online ? undefined : OFFLINE_REASON}
      onSave={onSave}
    />
  );
}

function updateFixtureFilter(
  filters: ReturnType<typeof useFixturesPageModel>['filters'],
  patch: Partial<FixtureFilter>
): void {
  if (patch.query !== undefined) filters.setQueryDraft(patch.query);
  if (patch.kind !== undefined) filters.setKindDraft(patch.kind);
}

/** Renders the Connections Fixtures tab and its create/edit dialog. */
export function FixturesPage(): ReactElement {
  const model = useFixturesPageModel();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FixtureListRow | undefined>();
  const openNew = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (fixture: FixtureListRow): void => {
    setEditing(fixture);
    setFormOpen(true);
  };
  const save = async (
    draft: Parameters<FixtureFormDialogProps['onSave']>[0]
  ): ReturnType<FixtureFormDialogProps['onSave']> => {
    const saved = await model.mutations.save({ id: editing?.id, draft });
    if (editing === undefined) void navigate(`/inventory/fixtures/${saved.id}`);
    return saved;
  };

  return (
    <InventoryPage
      title="Connections"
      icon={INVENTORY_ICONS.connection}
      description="What plugs into, feeds or pairs with what, across the house."
      actions={<NewFixtureButton online={model.online} onNew={openNew} />}
      tabs={<ConnectionsTabs />}
      banner={!model.online ? <OfflineBanner /> : staleBanner(model)}
      bodyClassName="gap-3"
      overlay={
        <FixtureOverlay
          model={model}
          formOpen={formOpen}
          editing={editing}
          onOpenChange={setFormOpen}
          onSave={save}
        />
      }
    >
      <FixturesList
        rows={model.fixtures.rows}
        total={model.fixtures.total}
        unfilteredTotal={model.unfilteredTotal}
        queryDraft={model.filters.queryDraft}
        filter={model.filters.filter}
        locations={model.locations.locations}
        status={model.status}
        hasLoaded={model.hasLoaded}
        hasNextPage={model.fixtures.hasNextPage}
        onLoadMore={model.fixtures.fetchNextPage}
        onFilterChange={(patch) => updateFixtureFilter(model.filters, patch)}
        onClearFilters={model.filters.clearFilters}
        onOpen={(id) => void navigate(`/inventory/fixtures/${id}`)}
        onEdit={openEdit}
        onNew={openNew}
        onRetry={model.retry}
      />
    </InventoryPage>
  );
}
