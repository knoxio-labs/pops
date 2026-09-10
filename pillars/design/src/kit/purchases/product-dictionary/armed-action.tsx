import { useState } from 'react';

import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

/**
 * A control's two names: the verb a reader sees, and the accessible name
 * that also says what it acts on. A list of many rows must not offer many
 * buttons called the same thing to anyone navigating by control.
 */
export interface ArmedActionLabel {
  readonly text: string;
  readonly accessible: string;
}

interface ArmedActionProps {
  readonly arm: ArmedActionLabel;
  readonly confirm: ArmedActionLabel;
  readonly cancel: ArmedActionLabel;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
  /** Starts already armed, so a design state can show the confirm step with no click. */
  readonly startArmed?: boolean;
}

/**
 * An action that asks twice, inline, where it stands: spent only where the
 * first click would destroy something no pass can rebuild. Every other
 * correction on the dictionary is one click and stays that way: ceremony
 * spread over the recoverable actions is ceremony a reader learns to click
 * through, which costs it exactly where it matters.
 *
 * Inline rather than a dialog, so the row stays legible behind the two verbs
 * that replace the one they qualify. The confirming button carries the
 * consequence in its own label rather than in prose beside it: naming what
 * the click takes is the information, not "are you sure?".
 */
export function ArmedAction({
  arm,
  confirm,
  cancel,
  isPending,
  onConfirm,
  startArmed = false,
}: ArmedActionProps): ReactElement {
  const [armed, setArmed] = useState(startArmed);

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
