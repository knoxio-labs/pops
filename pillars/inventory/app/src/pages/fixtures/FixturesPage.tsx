import { Cable, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@pops/ui';

import { OFFLINE_REASON, StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { FixtureFormDialog } from './fixture-form-dialog.js';
import { isFixtureKind } from './fixture-kinds.js';
import { FixturesList } from './fixtures-list.js';
import { useFixturesPageModel } from './fixtures-page-model.js';

import type { ReactElement } from 'react';

import type { FixtureFormDialogProps } from './fixture-form-dialog.js';
import type { FixtureFilter, FixtureListRow } from './fixture-model.js';

function staleBanner(model: ReturnType<typeof useFixturesPageModel>): ReactElement | null {
  const group = model.changed.groups[0];
  if (!model.changed.stale || group === undefined) return null;
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
  return online ? (
    button
  ) : (
    <HintTooltip label="New fixture" disabledReason={OFFLINE_REASON}>
      {button}
    </HintTooltip>
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
  if (patch.q !== undefined) filters.setQueryDraft(patch.q);
  if (patch.kind !== undefined) {
    filters.setKindDraft(patch.kind === null || isFixtureKind(patch.kind) ? patch.kind : null);
  }
}

/** Renders the server-filtered Fixtures list and its create/edit dialog. */
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
    draft: Parameters<typeof model.mutations.save>[0]['draft']
  ): Promise<void> => {
    await model.mutations.save({ draft });
  };

  return (
    <InventoryPage
      title="Fixtures"
      icon={Cable}
      description="The fixed points inventory items wire into."
      actions={<NewFixtureButton online={model.online} onNew={openNew} />}
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
        filter={model.filters.filter}
        locations={model.locations.locations}
        status={model.fixtures.status}
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
