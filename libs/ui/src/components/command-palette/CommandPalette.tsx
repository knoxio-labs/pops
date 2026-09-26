import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Command, CommandBareInput } from '../../primitives/command';
import { Dialog, DialogContent, DialogTitle } from '../../primitives/dialog';
import { Footer, PaletteArgumentSteps, ScopeChips } from './palette-parts';
import { PaletteResults } from './palette-results';
import { usePaletteState } from './palette-state';

import type { ReactElement, ReactNode } from 'react';

import type { PaletteCommand, PaletteSource, PaletteState } from './types';

/** Props for {@link CommandPalettePanel}. */
export interface CommandPalettePanelProps<C extends PaletteCommand = PaletteCommand> {
  source: PaletteSource<C>;
  initial?: PaletteState;
  /** The row cmdk starts on, by entry id. */
  initialActiveId?: string;
  /** Shown beside a step chip, such as “3 items”. */
  subject?: string;
  /** Trailing hint per row, such as the caller's shortcut caps. */
  renderHint?: (entry: C) => ReactNode;
  onRun?: (command: C, argument: C | null) => void;
  onOpenBeside?: (entry: C) => void;
  onSeeAll?: (query: string, scope: string) => void;
  /** Called on mount and after each query or scope change. */
  onQueryChange?: (query: string, scope: string) => void;
  onClose?: () => void;
}

function usePalettePanelModel<C extends PaletteCommand>(props: CommandPalettePanelProps<C>) {
  const { source, initial, initialActiveId, onQueryChange } = props;
  const api = usePaletteState(source, initial);
  const [active, setActive] = useState(initialActiveId ?? '');
  const onQueryChangeRef = useRef(onQueryChange);
  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);
  useEffect(() => {
    onQueryChangeRef.current?.(api.state.query, api.state.scope);
  }, [api.state.query, api.state.scope]);
  const activeEntry = api.sections
    .flatMap((section) => section.entries)
    .find((entry) => entry.id === active);
  return { api, active, setActive, activeEntry };
}

/** The palette content, drawn in place or inside {@link CommandPalette}. */
export function CommandPalettePanel<C extends PaletteCommand>(
  props: CommandPalettePanelProps<C>
): ReactElement {
  const { source, subject, renderHint, onRun, onOpenBeside, onSeeAll, onClose } = props;
  const { api, active, setActive, activeEntry } = usePalettePanelModel(props);
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
        <PaletteArgumentSteps steps={api.state.steps} subject={subject} />
        <CommandBareInput
          value={api.state.query}
          onValueChange={api.setQuery}
          placeholder={source.placeholder(api.state.scope, api.step)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm"
        />
        <ScopeChips
          scopes={source.scopes}
          activeScope={api.state.scope}
          locked={api.state.steps.length > 0}
        />
      </div>
      <PaletteResults
        api={api}
        scopes={source.scopes}
        onRun={onRun}
        onSeeAll={onSeeAll}
        onClose={onClose}
        renderHint={renderHint}
      />
      <Footer />
    </Command>
  );
}

/** The palette dialog, opened and closed by the caller. */
export function CommandPalette<C extends PaletteCommand>(
  props: CommandPalettePanelProps<C> & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }
): ReactElement {
  const { open, onOpenChange, ...panelProps } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-0 bg-transparent p-0 pt-[env(safe-area-inset-top)] md:p-0 shadow-none md:top-24 md:max-w-160 md:translate-y-0"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <CommandPalettePanel {...panelProps} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
