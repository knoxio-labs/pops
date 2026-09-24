/**
 * Typing a code for an item that has none, inline in the selection. The
 * code is saved before anything prints; a code another item holds is
 * refused with the holder's name and the next free code.
 */
import { Check, X } from 'lucide-react';
import { useState } from 'react';

import { Button, TextInput } from '@pops/ui';

import type { CodeSaveResult } from './useSaveCode';

/** Props for {@link CodeField}. */
export interface CodeFieldProps {
  itemName: string;
  initial: string;
  /** A refusal to show straight away, from a one-tap save that collided. */
  initialResult?: CodeSaveResult | null;
  onSave: (code: string) => Promise<CodeSaveResult>;
  onCancel: () => void;
}

function Refusal({
  code,
  result,
  onUse,
}: {
  code: string;
  result: CodeSaveResult;
  onUse: (code: string) => void;
}) {
  if (result.status === 'failed') {
    return (
      <p className="text-xs text-destructive" role="alert">
        {result.message}
      </p>
    );
  }
  if (result.status !== 'taken') return null;
  const { suggestion } = result;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-destructive" role="alert">
      <span>
        {code} is on {result.holder}
      </span>
      {suggestion ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onUse(suggestion)}>
          Use {suggestion}
        </Button>
      ) : null}
    </p>
  );
}

/** The inline code editor; the code is kept only once the server has saved it. */
export function CodeField({ itemName, initial, initialResult, onSave, onCancel }: CodeFieldProps) {
  const [draft, setDraft] = useState(initial);
  const [result, setResult] = useState<CodeSaveResult | null>(initialResult ?? null);
  const [saving, setSaving] = useState(false);
  const code = draft.trim().toUpperCase();
  const [refused, setRefused] = useState(initialResult ? initial.trim().toUpperCase() : '');

  const save = async () => {
    if (!code) return;
    setSaving(true);
    const outcome = await onSave(code);
    setSaving(false);
    if (outcome.status !== 'saved') {
      setRefused(code);
      setResult(outcome);
    }
  };

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center gap-1">
        <TextInput
          aria-label={`Code for ${itemName}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setResult(null);
          }}
          className="font-mono uppercase"
          containerClassName="flex-1"
          aria-invalid={result !== null}
          autoFocus
        />
        <Button type="submit" size="icon" aria-label="Save code" disabled={!code || saving}>
          <Check />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={onCancel}>
          <X />
        </Button>
      </div>
      {result ? (
        <Refusal
          code={refused}
          result={result}
          onUse={(next) => {
            setDraft(next);
            setResult(null);
          }}
        />
      ) : null}
    </form>
  );
}
