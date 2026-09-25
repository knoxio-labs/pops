/**
 * A container's item page body (decided: contents-first split). Contents
 * take the width; the container's own facts and folded sections sit in a
 * side pane that becomes a sheet below the split width. Store here and the
 * bulk move preview open as sheets over it, never as another page.
 */
import { PanelRight } from 'lucide-react';
import { useReducer, useState } from 'react';

import { Button } from '@pops/ui';

import { MovePlanPanel, Sheet, planMove } from '../foundation';
import { FactsSection } from '../item-detail/facts-section';
import { SectionStack } from '../item-detail/section-stack';
import { ContentsPane } from './contents-pane';
import { StoreHereSheetStub } from './store-here-stub';
import { initialUnpack, unpackReducer } from './unpack-model';

import type { PlacementTarget, SelectionState, StoreHereTarget } from '../foundation';
import type { DetailCondition, ItemDetailModel } from '../item-detail/detail-model';
import type { SectionSpec } from '../item-detail/sections';
import type { ExitKind, UnpackState } from './unpack-model';

/** Where a container state opens: the unpack flow, a selection, a filter, a sheet. */
export interface WorkspaceSeed {
  unpack?: UnpackState;
  selection?: SelectionState;
  query?: string;
  storeHereOpen?: boolean;
  moveIds?: readonly string[];
  detailsOpen?: boolean;
}

/** Props for {@link ContainerWorkspace}. */
export interface ContainerWorkspaceProps {
  model: ItemDetailModel;
  condition: DetailCondition;
  sections: readonly SectionSpec[];
  readOnly: boolean;
  seed?: WorkspaceSeed;
  storeHereOpen: boolean;
  onStoreHereChange: (open: boolean) => void;
  onExit?: (count: number, how: ExitKind) => void;
}

const MOVE_TARGET: PlacementTarget = { kind: 'location', locationId: 'loc-kitchen' };

function Details({
  model,
  condition,
  sections,
  readOnly,
}: Pick<ContainerWorkspaceProps, 'model' | 'condition' | 'sections' | 'readOnly'>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="@container shrink-0 rounded-xl border bg-card p-3">
        <FactsSection
          facts={model.facts}
          typeName={model.item.typeName}
          condition={condition}
          layout="list"
          readOnly={readOnly}
        />
      </div>
      <SectionStack
        sections={sections.filter((spec) => spec.id !== 'documents')}
        initialOpen={condition.openSection ?? null}
      />
    </div>
  );
}

function storeTarget(model: ItemDetailModel): StoreHereTarget {
  const container = model.item.container;
  const base: Omit<StoreHereTarget, 'state'> = {
    kind: 'container',
    id: model.item.id,
    name: model.item.name,
  };
  if (container?.access === 'closed') return { ...base, state: 'closed' };
  return { ...base, state: container?.full === true ? 'full' : 'open' };
}

function MoveSheet({
  model,
  ids,
  onClose,
}: {
  model: ItemDetailModel;
  ids: readonly string[];
  onClose: () => void;
}) {
  const things = ids.length === 1 ? '1 item' : `${ids.length} items`;
  return (
    <Sheet
      open={ids.length > 0}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Move ${things} out of ${model.item.name}`}
      description="Check what moves before anything does."
    >
      <MovePlanPanel
        plan={planMove({ world: model.world, selectedIds: ids, target: MOVE_TARGET })}
        world={model.world}
        onCancel={onClose}
      />
    </Sheet>
  );
}

function DetailsToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex justify-end @2xl:hidden">
      <Button
        variant="outline"
        size="sm"
        prefix={<PanelRight className="size-4" aria-hidden />}
        onClick={onOpen}
      >
        Details
      </Button>
    </div>
  );
}

const NO_SEED: WorkspaceSeed = {};

/** The container workspace. */
export function ContainerWorkspace(props: ContainerWorkspaceProps) {
  const { model, seed = NO_SEED } = props;
  const container = model.item.container;
  const inside = [...model.world.items.values()]
    .filter(
      (row) => row.placement.kind === 'container' && row.placement.containerId === model.item.id
    )
    .map((row) => row.id);
  const [state, dispatch] = useReducer(
    unpackReducer,
    seed.unpack ?? initialUnpack(inside, container?.access ?? 'open')
  );
  const [moveIds, setMoveIds] = useState<readonly string[]>(seed.moveIds ?? []);
  const [detailsOpen, setDetailsOpen] = useState(seed.detailsOpen ?? false);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 @2xl:flex-row @2xl:gap-5">
      <DetailsToggle onOpen={() => setDetailsOpen(true)} />
      <ContentsPane
        model={model}
        state={state}
        dispatch={dispatch}
        initialSelection={seed.selection}
        initialQuery={seed.query}
        readOnly={props.readOnly}
        onExit={props.onExit}
        onStoreHere={() => props.onStoreHereChange(true)}
        onMove={setMoveIds}
      />
      <aside
        aria-label={`About ${model.item.name}`}
        className="hidden w-72 shrink-0 flex-col @2xl:flex @4xl:w-80"
      >
        <Details {...props} />
      </aside>
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen} title={`About ${model.item.name}`}>
        <Details {...props} />
      </Sheet>
      <MoveSheet model={model} ids={moveIds} onClose={() => setMoveIds([])} />
      <StoreHereSheetStub
        open={props.storeHereOpen}
        onOpenChange={props.onStoreHereChange}
        world={model.world}
        target={storeTarget(model)}
      />
    </div>
  );
}
