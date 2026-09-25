import { FIXTURE_KINDS, FixtureMark } from '@/kit/inventory/fixtures/fixture-kinds';
import { CodeBadge, INVENTORY_ICONS, ItemMark, RowVerb } from '@/kit/inventory/foundation';
/**
 * One registry row: the item, the connector, what it connects to, the room
 * and the day it was connected, then Trace and Disconnect. Either end opens
 * its own page. Disconnecting is undoable, so it is a quiet verb, not red.
 */
import { Unlink, Waypoints } from 'lucide-react';

import { ButtonPrimitive, Checkbox, cn } from '@pops/ui';

import type { ConnectionRow, ResolvedEnd } from './connection-model';

/** The registry grid: select, item, connector, far end, room, since, verbs. */
export const REGISTRY_GRID =
  'grid-cols-[1rem_minmax(0,1fr)_1rem_minmax(0,1fr)_4.5rem] @3xl:grid-cols-[1rem_minmax(0,1.1fr)_1rem_minmax(0,1.3fr)_8rem_4rem_4.5rem]';

/** One end of a connection: its mark, name and code or kind. */
export function EndCell({ end, onOpen }: { end: ResolvedEnd; onOpen?: (key: string) => void }) {
  const name = end.kind === 'item' ? end.item.name : end.fixture.name;
  const key = end.kind === 'item' ? `item:${end.item.id}` : `fixture:${end.fixture.id}`;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {end.kind === 'item' ? <ItemMark item={end.item} /> : <FixtureMark kind={end.fixture.kind} />}
      <span className="flex min-w-0 flex-col">
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          className="h-auto min-w-0 justify-start px-0 text-sm font-medium hover:bg-transparent hover:underline"
          aria-label={`Open ${name}`}
          onClick={() => onOpen?.(key)}
        >
          <span className="truncate">{name}</span>
        </ButtonPrimitive>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {end.kind === 'item' ? (
            <CodeBadge code={end.item.code} />
          ) : (
            <span className="truncate">{FIXTURE_KINDS[end.fixture.kind].label}</span>
          )}
        </span>
      </span>
    </span>
  );
}

/** Props for {@link RegistryRow}. */
export interface RegistryRowProps {
  row: ConnectionRow;
  room: string;
  selected: boolean;
  focused: boolean;
  traced: boolean;
  onToggle?: (id: string, shiftKey: boolean) => void;
  onOpen?: (key: string) => void;
  onTrace?: (itemId: string) => void;
  onDisconnect?: (edgeId: string) => void;
  /** Why disconnecting is off, such as being offline. */
  lockedReason?: string;
}

const since = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/** One registry row. */
export function RegistryRow(props: RegistryRowProps) {
  const { row } = props;
  const Connector = INVENTORY_ICONS.connection;
  const farName = row.far.kind === 'item' ? row.far.item.name : row.far.fixture.name;
  return (
    <div
      role="row"
      aria-selected={props.selected}
      data-focused={props.focused || undefined}
      className={cn(
        'group grid h-12 items-center gap-3 border-l-2 border-transparent pr-2 pl-3',
        REGISTRY_GRID,
        props.selected ? 'bg-app-accent/10' : 'hover:bg-muted/60',
        props.traced && 'border-l-app-accent bg-app-accent/5',
        props.focused && 'ring-2 ring-inset ring-ring'
      )}
    >
      <Checkbox
        checked={props.selected}
        aria-label={`Select ${row.item.name} to ${farName}`}
        onClick={(event) => {
          event.preventDefault();
          props.onToggle?.(row.edge.id, event.shiftKey);
        }}
      />
      <EndCell end={{ kind: 'item', item: row.item }} onOpen={props.onOpen} />
      <Connector className="size-3.5 text-muted-foreground" aria-hidden />
      <EndCell end={row.far} onOpen={props.onOpen} />
      <span className="hidden truncate text-xs text-muted-foreground @3xl:block">{props.room}</span>
      <span className="hidden text-xs tabular-nums text-muted-foreground @3xl:block">
        {since(row.edge.createdAt)}
      </span>
      <span className="flex justify-end gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-focused:opacity-100">
        <RowVerb
          icon={Waypoints}
          label={`Trace from ${row.item.name}`}
          onClick={() => props.onTrace?.(row.item.id)}
        />
        <RowVerb
          icon={Unlink}
          label="Disconnect"
          disabledReason={props.lockedReason}
          onClick={() => props.onDisconnect?.(row.edge.id)}
        />
      </span>
    </div>
  );
}
