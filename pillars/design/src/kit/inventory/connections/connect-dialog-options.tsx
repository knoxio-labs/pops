import { FIXTURE_KINDS, FixtureMark } from '@/kit/inventory/fixtures/fixture-kinds';
/**
 * The choices the connect dialog offers: every item for the first end, and
 * items or fixtures for the second, each with the reason it cannot be
 * picked when it cannot. Queries match names and codes.
 */
import { CodeBadge, ItemMark } from '@/kit/inventory/foundation';
import { roomOf } from '@/kit/inventory/reports/report-model';

import { connectRefusal } from './connection-model';

import type { ConnectionEnd, ConnectionModel } from '@/kit/inventory/fixtures/fixture-model';
import type { ItemRowModel } from '@/kit/inventory/foundation';
import type { PickOption } from '@/kit/inventory/secondary-page/pick-list';

import type { ConnectionIndex } from './connection-model';

const matches = (query: string, ...texts: (string | null)[]) => {
  const needle = query.trim().toLowerCase();
  return needle === '' || texts.some((text) => text?.toLowerCase().includes(needle) === true);
};

function itemOption(item: ItemRowModel, index: ConnectionIndex, refusal?: string): PickOption {
  return {
    key: `item:${item.id}`,
    mark: <ItemMark item={item} />,
    title: item.name,
    meta: (
      <>
        <CodeBadge code={item.code} />
        <span className="truncate">{roomOf(index.world, item.id).name}</span>
      </>
    ),
    refusal:
      refusal ?? (item.lifecycle === 'active' ? undefined : `${item.name} is ${item.lifecycle}.`),
  };
}

/** Items for the first end. */
export function firstEndOptions(query: string, index: ConnectionIndex): PickOption[] {
  return [...index.world.items.values()]
    .filter((item) => item.container === null && matches(query, item.name, item.code))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((item) => itemOption(item, index));
}

/** Items or fixtures for the second end, refused where the pair cannot be made. */
export function secondEndOptions(args: {
  kind: 'item' | 'fixture';
  query: string;
  fromId: string | null;
  connections: readonly ConnectionModel[];
  index: ConnectionIndex;
}): PickOption[] {
  const { kind, query, fromId, connections, index } = args;
  const refusal = (to: ConnectionEnd) =>
    fromId === null ? undefined : (connectRefusal(fromId, to, connections, index) ?? undefined);
  if (kind === 'item') {
    return [...index.world.items.values()]
      .filter((item) => item.container === null && matches(query, item.name, item.code))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((item) => itemOption(item, index, refusal({ kind: 'item', itemId: item.id })));
  }
  return [...index.fixtures.values()]
    .filter((fixture) => matches(query, fixture.name, FIXTURE_KINDS[fixture.kind].label))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((fixture) => ({
      key: `fixture:${fixture.id}`,
      mark: <FixtureMark kind={fixture.kind} />,
      title: fixture.name,
      meta: (
        <span className="truncate">
          {FIXTURE_KINDS[fixture.kind].label}, {index.world.locations.get(fixture.locationId)?.name}
        </span>
      ),
      refusal: refusal({ kind: 'fixture', fixtureId: fixture.id }),
    }));
}

/** A picker key back to a connection end. */
export function endFromKey(key: string | null): ConnectionEnd | null {
  if (key === null) return null;
  const [kind, id = ''] = key.split(':');
  if (kind === 'item') return { kind: 'item', itemId: id };
  return kind === 'fixture' ? { kind: 'fixture', fixtureId: id } : null;
}
