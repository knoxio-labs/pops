/**
 * An item page: header, notices, then the body for its shape. A container
 * gets the contents-first workspace; anything else gets the E1 layout under
 * review. The page fills the frame and never scrolls; its lists do.
 */
import { cn } from '@pops/ui';

import { ContainerWorkspace } from '../container-workspace/workspace';
import { DetailBanners } from './detail-banners';
import { DetailDialogs } from './detail-dialogs';
import { DetailHeader } from './detail-header';
import { HeaderActions } from './header-actions';
import { RailTabsBody } from './layout-rail-tabs';
import { StackedBody } from './layout-stacked';
import { PAGE_HEIGHT } from './section-parts';
import { ToastDock } from './toast-dock';
import { useItemDetailPage } from './use-item-detail-page';

import type { WorkspaceSeed } from '../container-workspace/workspace';
import type { PlacementTarget } from '../foundation';
import type { DetailDialog } from './detail-dialogs';
import type { ListPosition } from './detail-header';
import type { DetailCondition, DetailLayout, ItemDetailModel } from './detail-model';

/** Props for {@link ItemDetailPage}. */
export interface ItemDetailPageProps {
  model: ItemDetailModel;
  condition?: DetailCondition;
  layout?: DetailLayout;
  position?: ListPosition;
  /** Opens a dialog on arrival, for the lifecycle review states. */
  initialDialog?: DetailDialog | null;
  workspace?: WorkspaceSeed;
  /** Recent placements the Move picker offers first. */
  recents?: readonly PlacementTarget[];
  className?: string;
}

const DEFAULT_POSITION: ListPosition = { listName: 'Items', index: 4, total: 46 };
const NO_CONDITION: DetailCondition = {};
const NO_RECENTS: readonly PlacementTarget[] = [];

type Page = ReturnType<typeof useItemDetailPage>;

function Body({ props, page }: { props: ItemDetailPageProps; page: Page }) {
  const model = props.model;
  const condition = props.condition ?? NO_CONDITION;
  if (model.item.container) {
    return (
      <ContainerWorkspace
        model={model}
        condition={condition}
        sections={page.sections}
        readOnly={page.readOnly}
        seed={props.workspace}
        storeHereOpen={page.actions.storeHereOpen}
        onStoreHereChange={page.actions.setStoreHereOpen}
        onExit={page.onExit}
      />
    );
  }
  const body = {
    model,
    condition,
    readOnly: page.readOnly,
    sections: page.sections,
    onQuantity: page.onQuantity,
  };
  return props.layout === 'rail-tabs' ? <RailTabsBody {...body} /> : <StackedBody {...body} />;
}

/** The item page. */
export function ItemDetailPage(props: ItemDetailPageProps) {
  const { model, className } = props;
  const condition = props.condition ?? NO_CONDITION;
  const page = useItemDetailPage(model, condition, {
    dialog: props.initialDialog ?? null,
    workspace: props.workspace,
  });
  const stacked = props.layout !== 'rail-tabs' && model.item.container === null;
  return (
    <div
      className={cn(
        '@container flex flex-col gap-4',
        PAGE_HEIGHT,
        stacked && 'max-w-3xl',
        className
      )}
    >
      <DetailHeader
        item={model.item}
        world={model.world}
        position={props.position ?? DEFAULT_POSITION}
        actions={
          <HeaderActions
            itemId={model.item.id}
            verbs={page.verbs}
            world={model.world}
            recents={props.recents ?? NO_RECENTS}
            menuOpen={condition.menuOpen}
            pickerOpen={page.actions.pickerOpen}
            onPickerOpenChange={page.actions.setPickerOpen}
            onVerb={page.actions.onVerb}
            onMenu={page.actions.onMenu}
            onPick={page.actions.onPick}
          />
        }
      />
      <DetailBanners model={model} condition={condition} />
      <Body props={props} page={page} />
      <DetailDialogs
        item={model.item}
        world={model.world}
        open={page.actions.dialog}
        onClose={() => page.actions.setDialog(null)}
        onDone={page.actions.onDone}
      />
      <ToastDock offer={page.toast.offer} onUndo={page.toast.undo} />
    </div>
  );
}
