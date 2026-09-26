import { CodeBadge, ItemMark, Sheet } from '@/kit/inventory/foundation';
import { PickList } from '@/kit/inventory/secondary-page';
/**
 * Wire items to a fixture: a side sheet with a searchable, multi-select list
 * of items. Items already wired stay listed with that reason; inactive items
 * say what they are. The button states how many will be wired.
 */
import { useState } from 'react';

import { Button } from '@pops/ui';

import type { ItemRowModel, PlacementWorld } from '@/kit/inventory/foundation';
import type { PickOption } from '@/kit/inventory/secondary-page';

import type { FixtureModel } from './fixture-model';

/** Props for {@link WireItemsSheet}. */
export interface WireItemsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixture: FixtureModel;
  world: PlacementWorld;
  wired: readonly ItemRowModel[];
  initialQuery?: string;
  initialPicked?: readonly string[];
  onWire?: (itemIds: readonly string[]) => void;
}

function refusal(item: ItemRowModel, wired: ReadonlySet<string>): string | undefined {
  if (wired.has(item.id)) return 'Already wired here.';
  return item.lifecycle === 'active' ? undefined : `${item.name} is ${item.lifecycle}.`;
}

function options(props: WireItemsSheetProps, query: string): PickOption[] {
  const wired = new Set(props.wired.map((item) => item.id));
  const needle = query.trim().toLowerCase();
  return [...props.world.items.values()]
    .filter((item) => item.container === null)
    .filter(
      (item) => needle === '' || `${item.name} ${item.code ?? ''}`.toLowerCase().includes(needle)
    )
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      key: item.id,
      mark: <ItemMark item={item} />,
      title: item.name,
      meta: <CodeBadge code={item.code} />,
      refusal: refusal(item, wired),
    }));
}

/** The wire-items sheet. */
export function WireItemsSheet(props: WireItemsSheetProps) {
  const [query, setQuery] = useState(props.initialQuery ?? '');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(props.initialPicked ?? []));
  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const label = picked.size === 1 ? 'Wire 1 item' : `Wire ${picked.size} items`;
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`Wire items to ${props.fixture.name}`}
      description="Choose what plugs into or hangs from this fixture."
      footer={
        <>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={picked.size === 0} onClick={() => props.onWire?.([...picked])}>
            {picked.size === 0 ? 'Wire items' : label}
          </Button>
        </>
      }
    >
      <PickList
        className="h-full"
        label="Items"
        multiple
        options={options(props, query)}
        selected={picked}
        query={query}
        placeholder="Find an item by name or code"
        onQueryChange={setQuery}
        onToggle={toggle}
      />
    </Sheet>
  );
}
