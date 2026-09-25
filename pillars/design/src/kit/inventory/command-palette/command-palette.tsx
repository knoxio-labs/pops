/**
 * Cmd-K: jump anywhere, run any verb, from the keyboard (spec 1.3). Built
 * on cmdk for the list and its arrow keys; query, scope and argument steps
 * are {@link usePaletteState}'s. The palette is modal and owns its keys.
 */
import { Search } from 'lucide-react';
import { useState } from 'react';

import {
  Command,
  CommandBareInput,
  CommandGroup,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogTitle,
} from '@pops/ui';

import { ShortcutHint } from '../shared/kbd';
import { PaletteArgumentSteps, palettePlaceholder } from './palette-argument-step';
import { searchResultsHref } from './palette-groups';
import { Empty, Footer, ScopeChips } from './palette-parts';
import { usePaletteState } from './use-palette-state';

import type { PaletteCommand } from '../shared/contracts';
import type { PaletteSource } from './palette-groups';
import type { PaletteApi, PaletteState } from './use-palette-state';

/** Props for {@link CommandPalettePanel}. */
export interface CommandPalettePanelProps {
  source: PaletteSource;
  initial?: PaletteState;
  /** The row cmdk starts on, by entry id, for review states. */
  initialActiveId?: string;
  /** Names what "This item" means, shown beside a step chip: "3 items". */
  subject?: string;
  onRun?: (command: PaletteCommand, argument: PaletteCommand | null) => void;
  /** Cmd-Enter: open the active record in the preview pane or a new tab. */
  onOpenBeside?: (entry: PaletteCommand) => void;
  onClose?: () => void;
  /** Opens a page: "See all results in Search" hands over the query this way. */
  onNavigate?: (href: string) => void;
}

function Entry({ entry, onSelect }: { entry: PaletteCommand; onSelect: () => void }) {
  const Icon = entry.icon;
  return (
    <CommandItem value={entry.id} onSelect={onSelect} className="gap-3 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="shrink-0 font-medium">{entry.label}</span>
      {entry.detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{entry.detail}</span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {entry.argument ? <span className="text-xs text-muted-foreground">Choose next</span> : null}
        {entry.shortcutId ? <ShortcutHint id={entry.shortcutId} /> : null}
      </span>
    </CommandItem>
  );
}

function Results({
  api,
  onRun,
  onOpenSearch,
}: {
  api: PaletteApi;
  onRun: CommandPalettePanelProps['onRun'];
  onOpenSearch: () => void;
}) {
  const { query, scope } = api.state;
  return (
    <CommandList className="max-h-96 p-1">
      {api.sections.map((section) => (
        <CommandGroup key={section.id} heading={section.title}>
          {section.entries.map((entry) => (
            <Entry
              key={`${section.id}-${entry.id}`}
              entry={entry}
              onSelect={() => {
                const choice = api.choose(entry);
                if (choice.kind === 'run') onRun?.(choice.command, choice.argument);
              }}
            />
          ))}
        </CommandGroup>
      ))}
      {api.sections.length === 0 ? (
        <Empty query={query} scope={scope} step={api.step?.label ?? null} />
      ) : null}
      {api.seeAll ? (
        <CommandGroup heading="Search">
          <Entry entry={api.seeAll} onSelect={onOpenSearch} />
        </CommandGroup>
      ) : null}
    </CommandList>
  );
}

/** The palette's content, drawn in place: the dialog's body and the gallery's subject. */
export function CommandPalettePanel(props: CommandPalettePanelProps) {
  const { source, initial, initialActiveId, subject, onRun, onOpenBeside, onClose, onNavigate } =
    props;
  const api = usePaletteState(source, initial);
  const [active, setActive] = useState(initialActiveId ?? '');
  const { query, scope, steps } = api.state;
  const activeEntry = api.sections
    .flatMap((section) => section.entries)
    .find((entry) => entry.id === active);
  const openSearch = () => {
    onNavigate?.(searchResultsHref(query, scope));
    onClose?.();
  };
  return (
    <Command
      shouldFilter={false}
      value={active}
      onValueChange={setActive}
      loop
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && activeEntry) {
          event.preventDefault();
          onOpenBeside?.(activeEntry);
          return;
        }
        const outcome = api.onKey(event.key);
        if (outcome.handled) event.preventDefault();
        if (outcome.close) onClose?.();
      }}
      className="h-auto w-160 max-w-full rounded-xl border bg-popover shadow-2xl"
    >
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <PaletteArgumentSteps steps={steps} subject={subject} />
        <CommandBareInput
          value={query}
          onValueChange={api.setQuery}
          placeholder={palettePlaceholder(api.step, scope)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm"
        />
        <ScopeChips scope={scope} locked={steps.length > 0} />
      </div>
      <Results api={api} onRun={onRun} onOpenSearch={openSearch} />
      <Footer />
    </Command>
  );
}

/** The palette as a dialog, opened with Cmd-K. */
export function CommandPalette({
  open,
  onOpenChange,
  ...props
}: CommandPalettePanelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-0 bg-transparent p-0 shadow-none md:top-24 md:max-w-160 md:translate-y-0"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <CommandPalettePanel {...props} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
