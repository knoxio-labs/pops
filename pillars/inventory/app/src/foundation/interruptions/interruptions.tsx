import { LogIn, RotateCw } from 'lucide-react';

import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

export function ReloadRequired({ onReload }: { onReload: () => void }): ReactElement {
  return (
    <div
      role="alert"
      className="flex w-md max-w-full items-start gap-3 rounded-lg border bg-popover px-3 py-3 text-popover-foreground shadow-lg"
    >
      <RotateCw className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Inventory was updated. Reload to keep making changes.</p>
        <p className="text-muted-foreground">
          This page is one version behind, so changes are off. Everything saved so far is kept.
        </p>
      </div>
      <Button size="sm" className="shrink-0" onClick={onReload}>
        Reload
      </Button>
    </div>
  );
}

export function SessionExpired({ onSignIn }: { onSignIn: () => void }): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-overlay-scrim/40 pt-24">
      <div
        role="alertdialog"
        aria-labelledby="session-expired-title"
        className="w-md max-w-full space-y-4 rounded-xl border bg-background p-6 shadow-xl"
      >
        <div className="space-y-1.5">
          <h2 id="session-expired-title" className="text-base font-semibold">
            Signed out
          </h2>
          <p className="text-sm text-muted-foreground">
            Your session ended. Sign in again and this page stays as it is. Every change up to now
            was saved.
          </p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" prefix={<LogIn className="size-4" aria-hidden />} onClick={onSignIn}>
            Sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
