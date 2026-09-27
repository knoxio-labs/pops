import { Button, Progress } from '@pops/ui';

import { INVENTORY_ICONS } from '../../../foundation/model/icons.js';
import { unpackProgress } from './unpack-model.js';

import type { ReactElement } from 'react';

import type { UnpackAction, UnpackState } from './unpack-model.js';

type Dispatch = (action: UnpackAction) => void;

/** Renders progress and the pause action while a container is being unpacked. */
export function UnpackStrip({
  state,
  dispatch,
}: {
  state: UnpackState;
  dispatch: Dispatch;
}): ReactElement {
  const { out, total } = unpackProgress(state);
  return (
    <div className="flex items-center gap-3 border-b bg-app-accent/5 px-4 py-2">
      <span className="shrink-0 text-sm font-medium">Unpacking</span>
      <Progress
        value={total === 0 ? 0 : (out / total) * 100}
        className="h-1.5 flex-1"
        aria-label={`${out} of ${total} out`}
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {out} of {total} out
      </span>
      <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'finish' })}>
        Stop for now
      </Button>
    </div>
  );
}

/** Renders the paused state after an in-progress unpack is closed. */
export function ClosedPartialNotice({
  name,
  state,
  dispatch,
  onOpen,
  readOnly = false,
}: {
  name: string;
  state: UnpackState;
  dispatch: Dispatch;
  onOpen?: () => void;
  readOnly?: boolean;
}): ReactElement {
  const { out, total } = unpackProgress(state);
  const Icon = INVENTORY_ICONS.closed;
  return (
    <div role="status" className="flex items-center gap-3 border-b bg-muted/60 px-4 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">
          {name} was closed with {total - out} of {total} still inside.
        </span>{' '}
        <span className="text-muted-foreground">Unpacking is paused. Open it to carry on.</span>
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={readOnly}
        onClick={onOpen ?? (() => dispatch({ type: 'open' }))}
      >
        Open and carry on
      </Button>
    </div>
  );
}

function RetireConfirmation({
  name,
  dispatch,
  onRetire,
  readOnly,
}: {
  name: string;
  dispatch: Dispatch;
  onRetire?: () => void;
  readOnly: boolean;
}): ReactElement {
  return (
    <div
      role="group"
      aria-label="Confirm retire"
      className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-left"
    >
      <p className="min-w-0 flex-1 text-sm">
        Retire {name}? It leaves lists and totals, and Undo brings it back.
      </p>
      <Button
        size="sm"
        variant="ghost"
        disabled={readOnly}
        onClick={() => dispatch({ type: 'cancel-retire' })}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        disabled={readOnly}
        onClick={() => (onRetire ? onRetire() : dispatch({ type: 'retire' }))}
      >
        Retire {name}
      </Button>
    </div>
  );
}

/** Renders the keep-or-retire question once the container is empty. */
export function OutcomePanel({
  name,
  state,
  dispatch,
  onRetire,
  readOnly = false,
}: {
  name: string;
  state: UnpackState;
  dispatch: Dispatch;
  onRetire?: () => void;
  readOnly?: boolean;
}): ReactElement {
  const Box = INVENTORY_ICONS.container;
  const asking = state.phase === 'confirm-retire';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-app-accent/15">
        <Box className="size-6 text-app-accent" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <h2 className="text-base font-semibold">{name} is empty</h2>
        <p className="text-sm text-muted-foreground">
          All {unpackProgress(state).total} things are out. Keep it to reuse, or retire it so it
          leaves your lists.
        </p>
      </div>
      {asking ? (
        <RetireConfirmation
          name={name}
          dispatch={dispatch}
          onRetire={onRetire}
          readOnly={readOnly}
        />
      ) : (
        <div className="flex gap-2">
          <Button disabled={readOnly} onClick={() => dispatch({ type: 'keep' })}>
            Keep the empty box
          </Button>
          <Button
            variant="outline"
            disabled={readOnly}
            onClick={() => dispatch({ type: 'ask-retire' })}
          >
            Retire it
          </Button>
        </div>
      )}
    </div>
  );
}

/** Renders the stable result after an empty container is kept or retired. */
export function CompletionPanel({
  name,
  retired,
}: {
  name: string;
  retired: boolean;
}): ReactElement {
  const Icon = retired ? INVENTORY_ICONS.retired : INVENTORY_ICONS.container;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        {retired ? `${name} is retired.` : `${name} is empty and ready to reuse.`}
      </p>
    </div>
  );
}
