import { ArrowUpRight, MoveRight } from 'lucide-react';

import { Button as UiButton, formatDate } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  LifecycleBadge,
  QuantityBadge,
  TypeLabel,
} from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { PreviewActions, PreviewFact, PreviewFrame, PreviewList } from './preview-parts.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** Props for an inventory item or container preview. */
export interface ItemPreviewProps {
  readonly item: ItemRowModel;
  readonly world: PlacementWorld;
  readonly onOpen: () => void;
  readonly onPickUp: () => void;
  readonly onPutBack: () => void;
  readonly onMove: () => void;
}

function containerContents(world: PlacementWorld, item: ItemRowModel): ItemRowModel[] {
  if (item.container === null) return [];
  return [...world.items.values()]
    .filter(
      (candidate) =>
        candidate.placement.kind === 'container' && candidate.placement.containerId === item.id
    )
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

function ItemActions({
  inHand,
  onOpen,
  onPickUp,
  onPutBack,
  onMove,
}: {
  readonly inHand: boolean;
  readonly onOpen: () => void;
  readonly onPickUp: () => void;
  readonly onPutBack: () => void;
  readonly onMove: () => void;
}) {
  const ActionIcon = inHand ? INVENTORY_ICONS.putBack : INVENTORY_ICONS.pickUp;
  return (
    <PreviewActions>
      <UiButton size="sm" onClick={onOpen} prefix={<ArrowUpRight className="size-4" aria-hidden />}>
        Open
      </UiButton>
      <UiButton
        size="sm"
        variant="outline"
        onClick={inHand ? onPutBack : onPickUp}
        prefix={<ActionIcon className="size-4" aria-hidden />}
      >
        {inHand ? 'Put back' : 'Pick up'}
      </UiButton>
      <UiButton
        size="sm"
        variant="outline"
        onClick={onMove}
        prefix={<MoveRight className="size-4" aria-hidden />}
      >
        Move
      </UiButton>
    </PreviewActions>
  );
}

function ItemFacts({
  item,
  world,
}: {
  readonly item: ItemRowModel;
  readonly world: PlacementWorld;
}) {
  return (
    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
      <PreviewFact label="Type" value={<TypeLabel typeName={item.typeName} />} />
      <PreviewFact
        label="Container"
        value={item.container === null ? 'No' : <ContainerStateBadge container={item.container} />}
      />
      <PreviewFact
        label="Quantity"
        value={item.quantity > 1 ? <QuantityBadge quantity={item.quantity} /> : '1'}
      />
      <PreviewFact label="Code" value={<CodeBadge code={item.code} showNone />} />
      <PreviewFact
        label="Lifecycle"
        value={
          item.lifecycle === 'active' ? 'Active' : <LifecycleBadge lifecycle={item.lifecycle} />
        }
      />
      <PreviewFact
        label="Placement"
        value={<PlacementPath world={world} placement={item.placement} maxSegments={4} />}
      />
      <PreviewFact label="Changed" value={formatDate(item.updatedAt)} />
    </dl>
  );
}

function ItemContents({ contents }: { readonly contents: readonly ItemRowModel[] }) {
  if (contents.length === 0) return null;
  return (
    <PreviewList title={`Direct contents · ${contents.length}`}>
      {contents.map((content) => (
        <div key={content.id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <ItemMark item={content} size="sm" />
          <span className="truncate">{content.name}</span>
          <QuantityBadge quantity={content.quantity} />
        </div>
      ))}
    </PreviewList>
  );
}

/** Renders item facts, placement actions, notes, and direct container contents. */
export function ItemPreview({
  item,
  world,
  onOpen,
  onPickUp,
  onPutBack,
  onMove,
}: ItemPreviewProps) {
  const inHand = item.placement.kind === 'in-hand';
  const contents = containerContents(world, item);
  return (
    <PreviewFrame
      title={
        <span className="flex min-w-0 items-center gap-3">
          <ItemMark item={item} size="md" />
          <span className="truncate">{item.name}</span>
        </span>
      }
      subtitle={item.container === null ? 'Inventory item' : 'Container'}
    >
      <ItemActions
        inHand={inHand}
        onOpen={onOpen}
        onPickUp={onPickUp}
        onPutBack={onPutBack}
        onMove={onMove}
      />
      <ItemFacts item={item} world={world} />
      {item.note !== null ? (
        <p className="mt-5 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{item.note}</p>
      ) : null}
      <ItemContents contents={contents} />
    </PreviewFrame>
  );
}
