import { Check, LoaderCircle, Sparkles } from 'lucide-react';
import { useId } from 'react';

import { Button, Input, Label } from '@pops/ui';

import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip';

import type { ReactElement, KeyboardEvent } from 'react';

import type { CodeEntry } from './code-assist';

/** Props for the item code field and its assist controls. */
export interface CodeFieldProps {
  readonly entry: CodeEntry;
  readonly onType: (value: string) => void;
  readonly onSuggest: () => void;
  readonly onAcceptOffered: () => void;
  readonly offline: boolean;
  readonly nothingToSuggestFrom: boolean;
}

function disabledReasonFor(offline: boolean, nothingToSuggestFrom: boolean): string | undefined {
  if (offline || nothingToSuggestFrom) return 'No code can be suggested right now';
  return undefined;
}

function unavailableCopy(offline: boolean): string {
  if (offline) return 'Offline, so no code can be suggested.';
  return 'No code can be suggested right now. Type one or leave it empty.';
}

function OfferedCode({ code, onAccept }: { code: string; onAccept: () => void }): ReactElement {
  return (
    <>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto min-h-0 p-0 text-app-accent"
        onClick={onAccept}
      >
        Use {code}
      </Button>{' '}
      <span>(press Enter)</span>
    </>
  );
}

function CodeStatus({
  entry,
  offline,
  onAcceptOffered,
  onType,
  id,
}: {
  entry: CodeEntry;
  offline: boolean;
  onAcceptOffered: () => void;
  onType: (value: string) => void;
  id: string;
}): ReactElement {
  const loading = entry.status === 'suggesting' || entry.status === 'checking';
  return (
    <p id={id} className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
      {loading ? <LoaderCircle className="mr-1 inline size-3 animate-spin" aria-hidden /> : null}
      {entry.status === 'offered' && entry.offered !== null ? (
        <OfferedCode code={entry.offered} onAccept={onAcceptOffered} />
      ) : null}
      {entry.status === 'free' ? (
        <>
          <Check className="mr-1 inline size-3 text-success" aria-hidden />
          {entry.value.trim()} is free.
        </>
      ) : null}
      {entry.status === 'taken' ? (
        <>
          That code is already on {entry.takenBy?.name ?? 'another item'}.
          {entry.freeCode === null ? null : (
            <>
              {' '}
              {entry.freeCode} is free.{' '}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto min-h-0 p-0"
                onClick={() => onType(entry.freeCode ?? '')}
              >
                Use {entry.freeCode}
              </Button>
            </>
          )}
        </>
      ) : null}
      {entry.status === 'unavailable' ? unavailableCopy(offline) : null}
    </p>
  );
}

/** Renders code input, suggestion state and server availability feedback. */
export function CodeField({
  entry,
  onType,
  onSuggest,
  onAcceptOffered,
  offline,
  nothingToSuggestFrom,
}: CodeFieldProps): ReactElement {
  const id = useId();
  const disabled =
    offline ||
    nothingToSuggestFrom ||
    entry.status === 'suggesting' ||
    entry.status === 'unavailable';
  const disabledReason = disabledReasonFor(offline, nothingToSuggestFrom);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && entry.status === 'offered' && entry.value === '') {
      event.preventDefault();
      onAcceptOffered();
    }
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Code</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={entry.value}
          onChange={(event) => onType(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Optional code"
          aria-describedby={`${id}-status`}
        />
        <HintTooltip label="Suggest a code" disabledReason={disabledReason}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Suggest a code"
            aria-disabled={disabled}
            disabled={disabled}
            onClick={disabled ? undefined : onSuggest}
            prefix={<Sparkles className="size-4" aria-hidden />}
          />
        </HintTooltip>
      </div>
      <CodeStatus
        entry={entry}
        offline={offline}
        onAcceptOffered={onAcceptOffered}
        onType={onType}
        id={`${id}-status`}
      />
    </div>
  );
}
