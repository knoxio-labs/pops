import { Button } from '@pops/ui';

import {
  ContainerStateBadge,
  CodeBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { ItemFacts } from './item-facts.js';
import { PreviewFrame, PreviewList, renderPreviewListRows } from './preview-parts.js';

import type { MouseEventHandler, ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

const I = INVENTORY_ICONS;

/** A placement action exposed by an item preview. */
export type PreviewVerb = 'pick-up' | 'put-back' | 'move';

/** Props for the item and container preview. */
export interface ItemPreviewProps {
  item: ItemRowModel;
  world: PlacementWorld;
  onOpen: () => void;
  /** `anchor` is the clicked verb button: the Move picker opens from it. */
  onVerb: (verb: PreviewVerb, anchor: HTMLElement) => void;
  /** Explains why mutation verbs are unavailable, such as while offline. */
  disabledReason?: string;
}

type LegacyItemPreviewProps = {
  item: ItemRowModel;
  world: PlacementWorld;
  onOpen: () => void;
  onPickUp: () => void;
  onPutBack: () => void;
  onMove: () => void;
};

function VerbButton({
  label,
  icon: Icon,
  disabledReason,
  onClick,
}: {
  label: string;
  icon: typeof I.move;
  disabledReason: string | undefined;
  onClick: MouseEventHandler<HTMLButtonElement>;
}): ReactElement {
  const disabled = disabledReason !== undefined;
  const button = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-disabled={disabled || undefined}
      className={disabled ? 'opacity-50' : undefined}
      onClick={disabled ? undefined : onClick}
      prefix={<Icon className="size-4" aria-hidden />}
    >
      {label}
    </Button>
  );
  if (!disabled) return button;
  return (
    <HintTooltip label={label} disabledReason={disabledReason}>
      {button}
    </HintTooltip>
  );
}

function ItemVerbs({ item, onOpen, onVerb, disabledReason }: ItemPreviewProps): ReactElement {
  const inHand = item.placement.kind === 'in-hand';
  const placementVerb: PreviewVerb = inHand ? 'put-back' : 'pick-up';
  const placementLabel = inHand ? 'Put back' : 'Pick up';
  const PlacementIcon = inHand ? I.putBack : I.pickUp;

  return (
    <>
      <Button type="button" size="sm" suffix={<ShortcutHint id="list-open" />} onClick={onOpen}>
        Open
      </Button>
      <VerbButton
        label={placementLabel}
        icon={PlacementIcon}
        disabledReason={disabledReason}
        onClick={(event) => onVerb(placementVerb, event.currentTarget)}
      />
      <VerbButton
        label="Move"
        icon={I.move}
        disabledReason={disabledReason}
        onClick={(event) => onVerb('move', event.currentTarget)}
      />
    </>
  );
}

function ItemContents({ item }: { item: ItemRowModel }): ReactElement {
  const contents = useItemRows({ containingItemId: item.id }, 50);
  const count = contents.total ?? contents.rows.length;
  return (
    <PreviewList title="Inside" count={count} empty="Empty. Store here from the container page.">
      {renderPreviewListRows({
        status: contents.status,
        rows: contents.rows,
        refetch: contents.refetch,
      })}
    </PreviewList>
  );
}

function ItemPreviewView(props: ItemPreviewProps): ReactElement {
  const { item, world, onOpen, onVerb, disabledReason } = props;
  return (
    <PreviewFrame
      mark={<ItemMark item={item} size="md" />}
      title={item.name}
      badges={
        <>
          <TypeLabel typeName={item.typeName} />
          <QuantityBadge quantity={item.quantity} />
          <ContainerStateBadge container={item.container} />
          <LifecycleBadge lifecycle={item.lifecycle} />
          <SyncBadge sync={item.sync} />
          <CodeBadge code={item.code} />
        </>
      }
      where={<PlacementPath world={world} placement={item.placement} maxSegments={5} />}
      actions={
        <ItemVerbs
          item={item}
          world={world}
          onOpen={onOpen}
          onVerb={onVerb}
          disabledReason={disabledReason}
        />
      }
    >
      {item.container === null ? <ItemFacts item={item} /> : <ItemContents item={item} />}
    </PreviewFrame>
  );
}

/** Renders an item or container preview with facts, contents, and placement verbs. */
export function ItemPreview(props: ItemPreviewProps): ReactElement;
export function ItemPreview(props: LegacyItemPreviewProps): ReactElement;
export function ItemPreview(props: ItemPreviewProps | LegacyItemPreviewProps): ReactElement {
  if ('onVerb' in props) return <ItemPreviewView {...props} />;
  return (
    <ItemPreviewView
      item={props.item}
      world={props.world}
      onOpen={props.onOpen}
      onVerb={(verb) => {
        if (verb === 'pick-up') props.onPickUp();
        else if (verb === 'put-back') props.onPutBack();
        else props.onMove();
      }}
    />
  );
}
