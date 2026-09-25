/**
 * The one placement picker (iOS parity #11), a popover rather than a
 * dialog because it is used mid-flow and must not take the page. Quick
 * picks on the left, the place tree on the right; typing replaces both
 * with ranked results and, when nothing matches exactly, a create row.
 */
import { Search } from 'lucide-react';
import { useMemo } from 'react';

import { Input, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { KeyCombo } from '../shared/kbd';
import { PickerRow, QuickPicks } from './picker-sections';
import { CreatePlaceRow, PickerTree } from './picker-tree';
import { usePickerState } from './use-picker-state';

import type { ReactElement } from 'react';

import type { PlacementPickerProps } from '../shared/contracts';
import type { PickerApi } from './use-picker-state';

function Results({
  api,
  onPick,
  onCreatePlace,
}: { api: PickerApi } & Pick<PlacementPickerProps, 'onPick' | 'onCreatePlace'>) {
  const { results, create } = api.model;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
      <ul aria-label="Matching places">
        {(results ?? []).map((option) => (
          <PickerRow key={option.key} option={option} onPick={onPick} onDrill={api.drillInto} />
        ))}
      </ul>
      {results?.length === 0 && create === null ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          No place or container matches “{api.position.query.trim()}”.
        </p>
      ) : null}
      {create && onCreatePlace ? <CreatePlaceRow create={create} onCreate={onCreatePlace} /> : null}
    </div>
  );
}

function Footer() {
  return (
    <footer className="flex items-center gap-4 border-t px-3 py-2 text-2xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <KeyCombo sequence={['ArrowUp']} />
        <KeyCombo sequence={['ArrowDown']} /> to move
      </span>
      <span className="inline-flex items-center gap-1">
        <KeyCombo sequence={['Enter']} /> to put it there
      </span>
      <span className="ml-auto inline-flex items-center gap-1">
        <KeyCombo sequence={['Escape']} /> to close
      </span>
    </footer>
  );
}

const ROW_STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

function moveRowFocus(panel: HTMLElement, key: string): boolean {
  const delta = ROW_STEPS[key];
  if (delta === undefined) return false;
  const rows = [...panel.querySelectorAll<HTMLElement>('[data-picker-row]:not([aria-disabled])')];
  const current = rows.findIndex((row) => row === panel.ownerDocument.activeElement);
  rows[Math.min(rows.length - 1, Math.max(0, current + delta))]?.focus();
  return true;
}

/** The picker's content, drawn in place: the popover's body and the gallery's subject. */
export function PlacementPickerPanel(props: PlacementPickerProps) {
  const input = useMemo(
    () => ({
      world: props.world,
      subject: props.subject,
      recents: props.recents,
      canCreate: props.onCreatePlace !== undefined,
    }),
    [props.world, props.subject, props.recents, props.onCreatePlace]
  );
  const api = usePickerState(input, { query: props.initialQuery, drillId: props.initialDrillId });
  const searching = api.model.results !== null;
  return (
    <div
      role="dialog"
      aria-label="Choose a place"
      onKeyDown={(event) => {
        if (moveRowFocus(event.currentTarget, event.key)) event.preventDefault();
      }}
      className="flex h-112 w-160 max-w-full flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="relative border-b p-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Search places and containers"
          placeholder="Search places and containers"
          value={api.position.query}
          onChange={(event) => api.setQuery(event.target.value)}
          className="h-9 border-0 pl-9 shadow-none focus-visible:ring-0"
        />
      </div>
      {searching ? (
        <Results api={api} onPick={props.onPick} onCreatePlace={props.onCreatePlace} />
      ) : null}
      {!searching && props.subject.kind === 'place' ? (
        <div className="flex min-h-0 flex-1 flex-col p-1.5">
          <PickerTree model={api.model} onPick={props.onPick} onDrill={api.drillInto} />
        </div>
      ) : null}
      {searching || props.subject.kind === 'place' ? null : (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
          <div className="min-h-0 overflow-y-auto p-1.5">
            <QuickPicks model={api.model} onPick={props.onPick} />
          </div>
          <div className="flex min-h-0 flex-col p-1.5">
            <PickerTree model={api.model} onPick={props.onPick} onDrill={api.drillInto} />
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
}

/** The picker as a popover on its trigger. */
export function PlacementPicker({
  trigger,
  open,
  onOpenChange,
  ...props
}: PlacementPickerProps & {
  trigger: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto border-0 bg-transparent p-0 shadow-none">
        <PlacementPickerPanel {...props} />
      </PopoverContent>
    </Popover>
  );
}
