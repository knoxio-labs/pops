/**
 * Giving an uncoded item its code, inline in the selection. A code is saved
 * by its own action before anything prints (ADR-002 D7, `item.setCode`),
 * because a printed code is never changed afterwards; a taken code is
 * refused with the holder's name and the next free code.
 */
import { Check, X } from 'lucide-react';
import { useState } from 'react';

import { Button, TextInput } from '@pops/ui';

/** A code already on another item, and what to use instead. */
export interface TakenCode {
  holder: string;
  suggestion: string;
}

/** Props for {@link PrintCodeField}. */
export interface PrintCodeFieldProps {
  itemName: string;
  initial: string;
  /** Answers whether a code is taken; the real page asks the server. */
  lookup: (code: string) => TakenCode | null;
  /** Opens with this code already refused, for review. */
  initialTaken?: boolean;
  onSave: (code: string) => void;
  onCancel: () => void;
}

function TakenNotice({
  code,
  taken,
  onUse,
}: {
  code: string;
  taken: TakenCode;
  onUse: () => void;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-destructive" role="alert">
      <span>
        {code} is on {taken.holder}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onUse}>
        Use {taken.suggestion}
      </Button>
    </p>
  );
}

/** The inline code editor; saves only a code no other item holds. */
export function PrintCodeField({
  itemName,
  initial,
  lookup,
  initialTaken = false,
  onSave,
  onCancel,
}: PrintCodeFieldProps) {
  const [draft, setDraft] = useState(initial);
  const [taken, setTaken] = useState<TakenCode | null>(initialTaken ? lookup(initial) : null);
  const code = draft.trim().toUpperCase();

  const save = () => {
    const holder = lookup(code);
    if (holder) setTaken(holder);
    else if (code) onSave(code);
  };

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex items-center gap-1">
        <TextInput
          aria-label={`Code for ${itemName}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setTaken(null);
          }}
          className="font-mono uppercase"
          containerClassName="flex-1"
          aria-invalid={taken !== null}
          autoFocus
        />
        <Button type="submit" size="icon" aria-label="Save code" disabled={!code}>
          <Check />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={onCancel}>
          <X />
        </Button>
      </div>
      {taken ? (
        <TakenNotice
          code={code}
          taken={taken}
          onUse={() => {
            setDraft(taken.suggestion);
            setTaken(null);
          }}
        />
      ) : null}
    </form>
  );
}
