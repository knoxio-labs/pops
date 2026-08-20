import { useState } from 'react';

import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

/**
 * A control's two names: the verb a reader sees, and the accessible name that
 * also says what it acts on.
 *
 * Both are required rather than one falling back to the other, because the
 * dictionary's rule is that a list of a hundred entries must not offer a
 * hundred buttons called "Forget" to anyone navigating by control.
 */
export interface ArmedActionLabel {
  readonly text: string;
  readonly accessible: string;
}

interface ArmedActionProps {
  /** The offer, before arming. */
  readonly arm: ArmedActionLabel;
  /** The same verb again, naming what goes with it. */
  readonly confirm: ArmedActionLabel;
  readonly cancel: ArmedActionLabel;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
}

/**
 * An action that asks twice, inline, where it stands.
 *
 * The second click is spent only where the first one would destroy something
 * no pass can rebuild — a name a human typed, or the decisions attached to a
 * product. Every other correction on the dictionary is one click and stays
 * that way: ceremony spread over the recoverable actions is ceremony the
 * reader learns to click through, which costs it exactly where it matters.
 *
 * Inline rather than a dialog, because the two verbs replace the one they
 * qualify and the row stays legible behind them. A modal would take the
 * wording, the product and the neighbouring corrections off the screen at
 * the moment the reader is deciding about all four.
 *
 * The confirming button carries the consequence in its own label rather than
 * in prose beside it. "Are you sure?" is not information; naming what the
 * click takes is.
 */
export function ArmedAction({
  arm,
  confirm,
  cancel,
  isPending,
  onConfirm,
}: ArmedActionProps): ReactElement {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-label={arm.accessible}
        onClick={() => setArmed(true)}
      >
        {arm.text}
      </Button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        aria-label={confirm.accessible}
        onClick={onConfirm}
      >
        {confirm.text}
      </Button>
      <Button
        size="sm"
        variant="outline"
        aria-label={cancel.accessible}
        onClick={() => setArmed(false)}
      >
        {cancel.text}
      </Button>
    </>
  );
}
