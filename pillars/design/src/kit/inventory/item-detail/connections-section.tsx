/**
 * What this item is connected to: other items (a soundbar on HDMI) and house
 * fixtures (the power point it is plugged into), each with the relation in
 * words and where the other end is. Disconnect is on the row; Connect adds.
 */
import { Unlink } from 'lucide-react';

import { INVENTORY_ICONS, RowVerb } from '../foundation';
import { EmptyLine } from './section-parts';
import { VerbButton } from './verb-button';

import type { DetailConnection } from './detail-model';

/** One line for a folded section header. */
export function connectionsSummary(connections: readonly DetailConnection[]): string {
  if (connections.length === 0) return 'Not connected to anything';
  return connections.map((connection) => connection.name).join(', ');
}

function ConnectionRow({
  connection,
  readOnly,
}: {
  connection: DetailConnection;
  readOnly: boolean;
}) {
  const Icon = connection.target === 'fixture' ? INVENTORY_ICONS.fixture : INVENTORY_ICONS.item;
  return (
    <li className="group flex min-h-11 items-center gap-3 px-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="text-muted-foreground">{connection.relation} </span>
        <span className="font-medium">{connection.name}</span>
      </span>
      <span className="hidden shrink-0 truncate text-xs text-muted-foreground @md:inline">
        {connection.where}
      </span>
      {readOnly ? null : (
        <span className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <RowVerb icon={Unlink} label={`Disconnect ${connection.name}`} />
        </span>
      )}
    </li>
  );
}

/** The connections block. */
export function ConnectionsSection({
  connections,
  readOnly = false,
}: {
  connections: readonly DetailConnection[];
  readOnly?: boolean;
}) {
  if (connections.length === 0) {
    return (
      <EmptyLine
        icon={INVENTORY_ICONS.connection}
        text="Not connected to anything."
        actionLabel={readOnly ? undefined : 'Connect'}
      />
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <ul aria-label="Connections" className="divide-y divide-border/60">
        {connections.map((connection) => (
          <ConnectionRow key={connection.id} connection={connection} readOnly={readOnly} />
        ))}
      </ul>
      {readOnly ? null : (
        <VerbButton
          label="Connect"
          icon={INVENTORY_ICONS.connection}
          variant="ghost"
          className="self-start"
        />
      )}
    </div>
  );
}
