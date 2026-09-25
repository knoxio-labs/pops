/**
 * The unpack flow's own surfaces inside the contents pane: the progress
 * strip while unpacking, the paused notice when the box was closed part
 * way, and the outcome question once it is empty, with retire confirmed
 * inline (3583 pattern) so the flow never hops into a modal.
 */
import { Button, Progress } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';
import { unpackProgress } from './unpack-model';

import type { UnpackAction, UnpackState } from './unpack-model';

type Dispatch = (action: UnpackAction) => void;

/** Progress while unpacking. */
export function UnpackStrip({ state, dispatch }: { state: UnpackState; dispatch: Dispatch }) {
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

/** Closed with things still inside: the unpack is paused, not over. */
export function ClosedPartialNotice({
  name,
  state,
  dispatch,
}: {
  name: string;
  state: UnpackState;
  dispatch: Dispatch;
}) {
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
      <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'open' })}>
        Open and carry on
      </Button>
    </div>
  );
}

/** The last thing is out: keep the empty container or retire it. */
export function OutcomePanel({
  name,
  state,
  dispatch,
}: {
  name: string;
  state: UnpackState;
  dispatch: Dispatch;
}) {
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
        <div
          role="group"
          aria-label="Confirm retire"
          className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-left"
        >
          <p className="min-w-0 flex-1 text-sm">
            Retire {name}? It leaves lists and totals, and Undo brings it back.
          </p>
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'cancel-retire' })}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => dispatch({ type: 'retire' })}>
            Retire {name}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => dispatch({ type: 'keep' })}>Keep the empty box</Button>
          <Button variant="outline" onClick={() => dispatch({ type: 'ask-retire' })}>
            Retire it
          </Button>
        </div>
      )}
    </div>
  );
}
