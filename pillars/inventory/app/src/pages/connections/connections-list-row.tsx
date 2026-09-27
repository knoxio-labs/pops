import { Cable, Package, Plug, Unlink, Waypoints } from 'lucide-react';

import { Badge, ButtonPrimitive, Checkbox, formatDate } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import {
  connectionEndName,
  fixtureKindLabel,
  type ConnectionRow,
  type ResolvedEnd,
} from './connection-model.js';

import type { ReactElement } from 'react';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';

/** The grid shared by the connection header and server-ordered rows. */
export const CONNECTION_GRID = 'grid-cols-[1rem_minmax(0,1fr)_1rem_minmax(0,1fr)_5rem_5.5rem_7rem]';

/** Props for one server-ordered connection registry row. */
export interface ConnectionListRowProps {
  row: ConnectionRow;
  room: string;
  selected: boolean;
  traced: boolean;
  online: boolean;
  disconnecting: boolean;
  onOpen: (end: ResolvedEnd) => void;
  onTrace: (row: ConnectionRow) => void;
  onDisconnect: (row: ConnectionRow) => void;
  onToggle: SelectionApi['onRowToggle'];
}

function EndCell({
  end,
  onOpen,
}: {
  readonly end: ResolvedEnd;
  readonly onOpen: ConnectionListRowProps['onOpen'];
}): ReactElement {
  const isItem = end.kind === 'item';
  const name = isItem ? end.item.name : end.fixture.name;
  const code = isItem ? end.item.code : null;
  const Icon = isItem ? Package : Plug;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <ButtonPrimitive
          type="button"
          variant="ghost"
          size="xs"
          className="h-auto min-w-0 justify-start px-0 text-sm font-medium hover:bg-transparent hover:text-app-accent"
          aria-label={`Open ${isItem ? 'item' : 'fixture'} ${name}`}
          onClick={() => onOpen(end)}
        >
          <span className="truncate">{name}</span>
        </ButtonPrimitive>
        {isItem ? (
          <span className="truncate text-xs text-muted-foreground">{code ?? 'No code'}</span>
        ) : (
          <Badge variant="outline" className="max-w-fit">
            {fixtureKindLabel(end.fixture.kind, end.fixture.type)}
          </Badge>
        )}
      </span>
    </span>
  );
}

function RowActions({
  row,
  farName,
  online,
  disconnecting,
  onTrace,
  onDisconnect,
}: Pick<ConnectionListRowProps, 'row' | 'online' | 'disconnecting' | 'onTrace' | 'onDisconnect'> & {
  readonly farName: string;
}): ReactElement {
  return (
    <span className="flex items-center justify-end gap-0.5">
      <ButtonPrimitive
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Trace from ${row.item.name}`}
        onClick={() => onTrace(row)}
      >
        <Waypoints className="size-4" aria-hidden />
      </ButtonPrimitive>
      <HintTooltip
        label={`Disconnect ${row.item.name} from ${farName}`}
        disabledReason={!online ? OFFLINE_REASON : undefined}
      >
        <ButtonPrimitive
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Disconnect ${row.item.name} from ${farName}`}
          aria-disabled={!online || undefined}
          disabled={!online || disconnecting}
          onClick={online && !disconnecting ? () => onDisconnect(row) : undefined}
        >
          <Unlink className="size-4" aria-hidden />
        </ButtonPrimitive>
      </HintTooltip>
    </span>
  );
}

function rowBackground(selected: boolean, traced: boolean): string {
  if (selected) return 'bg-app-accent/10';
  if (traced) return 'bg-app-accent/5';
  return 'hover:bg-muted/60';
}

/** Renders one registry row without changing server order. */
export function ConnectionListRow({
  row,
  room,
  selected,
  traced,
  online,
  disconnecting,
  onOpen,
  onTrace,
  onDisconnect,
  onToggle,
}: ConnectionListRowProps): ReactElement {
  const farName = connectionEndName(row.far);
  return (
    <div
      role="row"
      data-row-id={row.id}
      aria-selected={selected}
      className={`group grid min-h-14 items-center gap-3 border-b border-border/60 border-l-2 px-3 ${CONNECTION_GRID} ${rowBackground(
        selected,
        traced
      )} ${traced ? 'border-l-app-accent' : 'border-l-transparent'}`}
    >
      <Checkbox
        checked={selected}
        aria-label={`Select ${row.item.name} to ${farName}`}
        onClick={(event) => {
          event.preventDefault();
          onToggle(row.id, event.shiftKey);
        }}
      />
      <EndCell end={{ kind: 'item', item: row.item }} onOpen={onOpen} />
      <Cable className="size-3.5 text-muted-foreground" aria-hidden />
      <EndCell end={row.far} onOpen={onOpen} />
      <span className="truncate text-xs text-muted-foreground">{room}</span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDate(row.createdAt)}
      </span>
      <RowActions
        row={row}
        farName={farName}
        online={online}
        disconnecting={disconnecting}
        onTrace={onTrace}
        onDisconnect={onDisconnect}
      />
    </div>
  );
}
