import { PackageSearch } from 'lucide-react';

import { ButtonPrimitive, Checkbox } from '@pops/ui';

import { CodeBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { ResultRowFrame } from './result-row-frame.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** Props for the exact-code result card. */
export interface ExactCodeRowProps {
  readonly item: ItemRowModel;
  readonly query: string;
  readonly world: PlacementWorld;
  readonly active: boolean;
  readonly checked: boolean;
  readonly onActivate: () => void;
  readonly onOpen: () => void;
  readonly onToggle: (shiftKey: boolean) => void;
}

/** Renders the exact-code result before ranked text matches. */
export function ExactCodeRow({
  item,
  query,
  world,
  active,
  checked,
  onActivate,
  onOpen,
  onToggle,
}: ExactCodeRowProps) {
  return (
    <ResultRowFrame id={item.id} kind="item" active={active} onActivate={onActivate}>
      <span onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={checked}
          aria-label={`Select ${item.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle(event.shiftKey);
          }}
        />
      </span>
      <ItemMark item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="rounded bg-app-accent/15 px-1.5 py-0.5 text-2xs font-semibold text-app-accent">
            Exact code
          </span>
          <span className="truncate">{item.name}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <CodeBadge code={item.code} />
          <PlacementPath
            world={world}
            placement={item.placement}
            maxSegments={2}
            className="min-w-0"
          />
          <span className="sr-only">Matched query {query}</span>
        </span>
      </span>
      <ButtonPrimitive
        type="button"
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <PackageSearch className="mr-1.5 inline size-4" aria-hidden />
        Open
      </ButtonPrimitive>
    </ResultRowFrame>
  );
}
