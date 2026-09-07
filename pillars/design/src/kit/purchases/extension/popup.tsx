import { popupDisabled, popupGuidance } from '@/kit/purchases/extension/popup-guidance';

import { Button, cn } from '@pops/ui';

import type { CaptureStatus } from '@/fixtures/purchases-everyday-export';
import type { ReactNode } from 'react';

/**
 * The Everyday Rewards capture popup, at the 300px column Chrome gives it.
 *
 * Drawn on the product's tokens rather than the extension's own hand-rolled
 * stylesheet: the popup is the one POPS surface that never inherited the
 * theme layer, and reviewing it here is how that gets decided rather than
 * inherited.
 */
export function CapturePopup({ status }: { status: CaptureStatus | null }) {
  if (status === null) return <DetachedPopup />;

  const disabled = popupDisabled(status);
  const guidance = popupGuidance(status);

  return (
    <PopupFrame>
      <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
        <Count label="Receipts seen in the list" value={status.listed} />
        <Count label="Fully captured" value={status.captured} />
        <Count label="Still to fetch" value={status.pending} />
      </dl>

      <div className="space-y-1.5">
        <PopupButton disabled={disabled.history}>Load full history</PopupButton>
        <PopupButton disabled={disabled.fetch}>Fetch remaining receipts</PopupButton>
        <PopupButton disabled={disabled.download}>Download JSON</PopupButton>
      </div>

      <Message text={guidance.text} isError={guidance.isError} />
    </PopupFrame>
  );
}

/**
 * The popup opened over a tab the content scripts never attached to. It can
 * report nothing at all, so it says how to make itself work instead.
 */
function DetachedPopup() {
  return (
    <PopupFrame>
      <div className="space-y-1.5">
        <PopupButton disabled>Load full history</PopupButton>
        <PopupButton disabled>Fetch remaining receipts</PopupButton>
        <PopupButton disabled>Download JSON</PopupButton>
      </div>
      <Message
        text="Open everyday.com.au and reload the page, so the extension is running on it."
        isError
      />
    </PopupFrame>
  );
}

function PopupFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground w-[300px] space-y-3 border p-3.5 text-[13px]/[1.45]">
      <h1 className="text-[13px] font-medium">Everyday Rewards → POPS</h1>
      {children}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value.toLocaleString('en-AU')}</dd>
    </>
  );
}

function PopupButton({ disabled, children }: { disabled: boolean; children: string }) {
  return (
    <Button variant="outline" size="sm" disabled={disabled} className="w-full">
      {children}
    </Button>
  );
}

function Message({ text, isError }: { text: string; isError: boolean }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn('text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}
    >
      {text}
    </p>
  );
}
