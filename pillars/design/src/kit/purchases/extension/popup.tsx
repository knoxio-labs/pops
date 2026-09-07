import { popupDisabled, popupGuidance } from '@/kit/purchases/extension/popup-guidance';

import { Button, cn } from '@pops/ui';

import type { CaptureStatus } from '@/fixtures/purchases-everyday-export';
import type { PopupDisabled, PopupGuidance } from '@/kit/purchases/extension/popup-guidance';
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
  const disabled = status === null ? DETACHED_DISABLED : popupDisabled(status);
  const guidance = status === null ? DETACHED_GUIDANCE : popupGuidance(status);

  return (
    <PopupFrame>
      <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
        <Count label="Receipts seen in the list" value={status?.listed} />
        <Count label="Fully captured" value={status?.captured} />
        <Count label="Still to fetch" value={status?.pending} />
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
 * A popup opened over a tab the content scripts never attached to reports
 * nothing at all. The counts keep their placeholders rather than reading
 * zero, because none seen and none reported are different answers.
 */
const DETACHED_DISABLED: PopupDisabled = { history: true, fetch: true, download: true };

const DETACHED_GUIDANCE: PopupGuidance = {
  text: 'Open everyday.com.au and reload the page, so the extension is running on it.',
  isError: true,
};

function PopupFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground w-[300px] space-y-3 p-3.5 text-[13px]/[1.45]">
      <h1 className="text-[13px] font-medium">Everyday Rewards → POPS</h1>
      {children}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value === undefined ? '–' : String(value)}</dd>
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
