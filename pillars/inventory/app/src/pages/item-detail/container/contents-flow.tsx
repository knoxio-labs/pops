import { Search } from 'lucide-react';

import { Input } from '@pops/ui';

import { SelectionBar } from '../../../foundation/selection/selection-bar.js';
import {
  ClosedPartialNotice,
  CompletionPanel,
  OutcomePanel,
  UnpackStrip,
} from './unpack-panels.js';

import type { ReactElement } from 'react';

import type { SelectionBarAction } from '../../../foundation/model/contracts.js';
import type { SelectionApi } from '../../../foundation/selection/use-selection.js';
import type { UnpackAction, UnpackState } from './unpack-model.js';

/** Renders the current unpack transition panel above the contents list. */
export function ContentsFlow({
  name,
  state,
  dispatch,
  readOnly,
  onOpenContainer,
  onRetire,
}: {
  name: string;
  state: UnpackState;
  dispatch: (action: UnpackAction) => void;
  readOnly: boolean;
  onOpenContainer: () => void;
  onRetire: () => void;
}): ReactElement | null {
  if (state.phase === 'unpacking') return <UnpackStrip state={state} dispatch={dispatch} />;
  if (state.phase === 'closed-partial') {
    return (
      <ClosedPartialNotice
        name={name}
        state={state}
        dispatch={dispatch}
        onOpen={onOpenContainer}
        readOnly={readOnly}
      />
    );
  }
  if (state.phase === 'emptied' || state.phase === 'confirm-retire') {
    return (
      <OutcomePanel
        name={name}
        state={state}
        dispatch={dispatch}
        onRetire={onRetire}
        readOnly={readOnly}
      />
    );
  }
  if (state.phase === 'kept' || state.phase === 'retired') {
    return <CompletionPanel name={name} retired={state.phase === 'retired'} />;
  }
  return null;
}

/** Renders the floating bulk-selection actions for visible direct contents. */
export function SelectionDock({
  selection,
  loaded,
  carried,
  actions,
}: {
  selection: SelectionApi;
  loaded: number;
  carried: number;
  actions: readonly SelectionBarAction[];
}): ReactElement | null {
  if (selection.count === 0) return null;
  return (
    <div className="absolute inset-x-3 bottom-3">
      <SelectionBar
        count={selection.count}
        loadedCount={loaded}
        coverage={selection.coverage}
        actions={actions}
        carriedCount={carried}
        onSelectAll={selection.onHeaderToggle}
        onClear={selection.clearSelection}
      />
    </div>
  );
}

/** Renders the direct-content filter control. */
export function ContentsFilter({
  name,
  query,
  onQuery,
}: {
  name: string;
  query: string;
  onQuery: (value: string) => void;
}): ReactElement {
  return (
    <div className="relative w-44">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        aria-label={`Filter what is in ${name}`}
        placeholder="Filter"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        className="h-9 pl-8 text-sm"
      />
    </div>
  );
}
