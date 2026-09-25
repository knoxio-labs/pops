/**
 * The two web interruptions (decision 9: no storage-full on the web). A
 * page older than the server's protocol must reload before it can write;
 * an expired session must sign in again. Both leave the page readable and
 * say exactly what was and was not saved.
 */
import { LogIn, RotateCw } from 'lucide-react';

import { Button } from '@pops/ui';

/** The persistent notice when the server speaks a newer protocol than this page. */
export function ReloadRequired() {
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
      <Button size="sm" className="shrink-0">
        Reload
      </Button>
    </div>
  );
}

/** The shell's sign-in prompt over the page, drawn in place for review. */
export function SessionExpired() {
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
          <Button size="sm" prefix={<LogIn className="size-4" aria-hidden />}>
            Sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
