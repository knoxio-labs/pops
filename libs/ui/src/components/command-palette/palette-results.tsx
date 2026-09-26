import { CommandGroup, CommandItem, CommandList } from '../../primitives/command';
import { Empty } from './palette-parts';

import type { ReactElement, ReactNode } from 'react';

import type { PaletteApi, PaletteCommand, PaletteSection, PaletteSource } from './types';

function Entry<C extends PaletteCommand>({
  entry,
  onSelect,
  renderHint,
}: {
  entry: C;
  onSelect: () => void;
  renderHint?: (entry: C) => ReactNode;
}): ReactElement {
  const Icon = entry.icon;
  return (
    <CommandItem value={entry.id} onSelect={onSelect} className="gap-3 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="shrink-0 font-medium">{entry.label}</span>
      {entry.detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{entry.detail}</span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {entry.argument !== undefined ? (
          <span className="text-xs text-muted-foreground">Choose next</span>
        ) : null}
        {renderHint?.(entry)}
      </span>
    </CommandItem>
  );
}

function EmptyState<C extends PaletteCommand>({
  api,
  scopes,
}: {
  api: PaletteApi<C>;
  scopes: readonly { id: string; label: string }[];
}): ReactElement | null {
  if (api.sections.length > 0 || api.status !== 'ready') return null;
  const scopeIndex = scopes.findIndex((scope) => scope.id === api.state.scope);
  const nextScope =
    scopes.length > 1 ? scopes[(scopeIndex < 0 ? 0 : scopeIndex + 1) % scopes.length] : undefined;
  const scope = scopes.find((candidate) => candidate.id === api.state.scope) ?? {
    id: api.state.scope,
    label: api.state.scope,
  };
  return <Empty query={api.state.query} scope={scope} nextScope={nextScope} step={api.step} />;
}

/** Renders caller-owned sections, status text and the optional See all row. */
export function PaletteResults<C extends PaletteCommand>({
  api,
  scopes,
  onRun,
  onSeeAll,
  onClose,
  renderHint,
}: {
  api: PaletteApi<C>;
  scopes: PaletteSource<C>['scopes'];
  onRun?: (command: C, argument: C | null) => void;
  onSeeAll?: (query: string, scope: string) => void;
  onClose?: () => void;
  renderHint?: (entry: C) => ReactNode;
}): ReactElement {
  return (
    <CommandList className="max-h-96 p-1">
      {api.sections.map((section: PaletteSection<C>) => (
        <CommandGroup key={section.id} heading={section.title}>
          {section.entries.map((entry) => (
            <Entry
              key={`${section.id}-${entry.id}`}
              entry={entry}
              renderHint={renderHint}
              onSelect={() => {
                const choice = api.choose(entry);
                if (choice.kind === 'run') onRun?.(choice.command, choice.argument);
              }}
            />
          ))}
        </CommandGroup>
      ))}
      <EmptyState api={api} scopes={scopes} />
      {api.status !== 'ready' && typeof api.status === 'object' ? (
        <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
          {api.status.error}
        </div>
      ) : null}
      {api.seeAll ? (
        <CommandGroup heading="Search">
          <Entry
            entry={api.seeAll}
            renderHint={renderHint}
            onSelect={() => {
              onSeeAll?.(api.state.query.trim(), api.state.scope);
              onClose?.();
            }}
          />
        </CommandGroup>
      ) : null}
    </CommandList>
  );
}
