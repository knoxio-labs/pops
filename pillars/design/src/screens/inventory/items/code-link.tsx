import { Button, QrCode, QrCodePopover } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactElement } from 'react';

function CodeLinkReview({ failed = false }: { failed?: boolean }): ReactElement {
  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Inventory code</h1>
        <div className="flex items-center font-mono text-sm text-muted-foreground">
          <QrCodePopover value="pops-i://CAB-012" label="CAB-012" />
          CAB-012
        </div>
        {failed ? (
          <div className="space-y-3 rounded-md border bg-popover p-4 text-popover-foreground shadow-md">
            <h2 className="text-sm font-medium">CAB-012</h2>
            <QrCode value="pops-i://CAB-012" title="QR code for CAB-012" className="mx-auto w-48" />
            <p className="break-all font-mono text-xs">pops-i://CAB-012</p>
            <p role="alert" className="text-sm text-muted-foreground">
              Could not copy link. Copy it below or try again. (clipboard-write-failed)
            </p>
            <Button variant="outline" className="w-full">
              Try copying again
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

/** The code-link popup layout approved for inventory badges. */
export const meta: ScreenMeta = { title: 'Code link', frame: 'none' };

/** Clipboard failure retains the QR, link and retry action. */
export const states: ScreenStates = { 'copy-failed': () => <CodeLinkReview failed /> };

/** Shows the popup after clicking a code icon and copying its link. */
export default function CodeLinkScreen(): ReactElement {
  return <CodeLinkReview />;
}
