import { QrCode as QrCodeIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { QrCode } from './QrCode';

import type { ReactElement, SyntheticEvent } from 'react';

/** Exact QR/clipboard payload and the human-readable label shown above it. */
export interface QrCodePopoverProps {
  value: string;
  label: string;
}

type CopyState = 'idle' | 'copying' | 'copied' | 'failed' | 'unavailable';

function stopPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

function useCopyState(value: string) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const request = useRef(0);
  const copy = async (): Promise<void> => {
    const current = ++request.current;
    if (navigator.clipboard?.writeText === undefined) {
      setCopyState('unavailable');
      return;
    }
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(value);
      if (request.current === current) setCopyState('copied');
    } catch {
      if (request.current === current) setCopyState('failed');
    }
  };
  return {
    copyState,
    copy,
    invalidate: () => {
      request.current += 1;
    },
  };
}

const COPY_MESSAGES: Readonly<Record<CopyState, string>> = {
  idle: '',
  copying: 'Copying link…',
  copied: 'Link copied',
  failed: 'Could not copy link. Select the link or try again. (clipboard-write-failed)',
  unavailable: 'Clipboard unavailable. Select and copy the link. (clipboard-unavailable)',
};

/** Opens a QR popup and copies its payload on activation, isolating enclosing row actions. */
export function QrCodePopover({ value, label }: QrCodePopoverProps): ReactElement {
  const [open, setOpen] = useState(false);
  const { copyState, copy, invalidate } = useCopyState(value);
  const titleId = useId();
  const failed = copyState === 'failed' || copyState === 'unavailable';
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void copy();
        else invalidate();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="z-10 text-muted-foreground"
          aria-label={`Show QR code for ${label}`}
          onPointerDown={stopPropagation}
          onPointerUp={stopPropagation}
          onClick={stopPropagation}
          onKeyDown={stopPropagation}
          onKeyUp={stopPropagation}
        >
          <QrCodeIcon className="size-3.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        className="space-y-3"
        onPointerDown={stopPropagation}
        onPointerUp={stopPropagation}
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
        onKeyUp={stopPropagation}
      >
        <h2 id={titleId} className="text-sm font-medium">
          {label}
        </h2>
        <QrCode value={value} title={`QR code for ${label}`} className="mx-auto w-48" />
        <p className="font-mono text-xs break-all select-text">{value}</p>
        <p role={failed ? 'alert' : 'status'} className="text-sm text-muted-foreground">
          {COPY_MESSAGES[copyState]}
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={() => void copy()}>
          {failed ? 'Try copying again' : 'Copy link'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
