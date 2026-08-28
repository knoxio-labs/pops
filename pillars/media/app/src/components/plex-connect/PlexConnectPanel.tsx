/**
 * PlexConnectPanel — the `plex-connect` settings widget.
 *
 * Mounted by the shell into the `media.plex` section's `account` group via
 * the manifest's `widget.bundleSlot`, so linking an account never requires
 * pasting a raw token: the panel walks the plex.tv PIN handshake, shows the
 * code to type at https://plex.tv/link, and swaps to the connected identity
 * plus a disconnect control once plex.tv hands the token over.
 */
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, Button } from '@pops/ui';

import { PLEX_LINK_URL, usePlexConnect } from './usePlexConnect';

import type { PlexConnectModel } from './usePlexConnect';

const COPIED_RESET_MS = 2000;

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  // Clipboard access is denied outside a secure context and in some
  // embedded webviews; the code stays readable on screen either way, so a
  // rejection only means the affordance does not flip to "Copied".
  const handleCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, [code]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      aria-label={copied ? 'Code copied' : 'Copy code'}
      data-testid="plex-connect-copy"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function ConnectedAccount({ model }: { model: PlexConnectModel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm">
        Connected as <span className="font-medium">{model.username}</span>
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={model.isDisconnecting}
        onClick={model.disconnect}
        data-testid="plex-connect-disconnect"
      >
        {model.isDisconnecting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        Disconnect
      </Button>
    </div>
  );
}

function ConnectPrompt({ model }: { model: PlexConnectModel }) {
  const isRetry = model.status === 'expired';
  return (
    <div className="space-y-3">
      {isRetry && (
        <Alert data-testid="plex-connect-expired">
          <AlertDescription>That PIN expired before it was linked. Try again.</AlertDescription>
        </Alert>
      )}
      <Button
        size="sm"
        disabled={model.isRequestingPin}
        onClick={model.connect}
        data-testid="plex-connect-start"
      >
        {model.isRequestingPin && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        {isRetry ? 'Get a new code' : 'Connect to Plex'}
      </Button>
    </div>
  );
}

function PendingPinCode({ code }: { code: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enter this code at plex.tv/link to finish connecting.
      </p>
      <div className="flex items-center gap-3">
        <code
          className="text-2xl font-mono font-semibold tracking-[0.3em]"
          data-testid="plex-connect-code"
        >
          {code}
        </code>
        <CopyCodeButton code={code} />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <a
            href={PLEX_LINK_URL}
            target="_blank"
            rel="noreferrer noopener"
            // Restates the sizing the `sm` Button variant already renders on
            // this very anchor. `asChild` applies those classes through the
            // Slot, so the touch-target scanner — which reads the literal
            // `<a>` — cannot see that h-9 plus the `before:-inset-y-1`
            // expansion already clears 44px. Visually a no-op.
            className="h-9 min-w-11 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']"
          >
            <ExternalLink className="h-4 w-4 mr-1.5" />
            Open plex.tv/link
          </a>
        </Button>
        <span
          className="flex items-center text-sm text-muted-foreground"
          data-testid="plex-connect-waiting"
        >
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          Waiting for Plex…
        </span>
      </div>
    </div>
  );
}

export function PlexConnectPanel() {
  const model = usePlexConnect();
  const showPrompt = model.status === 'idle' || model.status === 'expired';

  return (
    <div className="space-y-3" data-testid="plex-connect-panel">
      {model.status === 'loading' && (
        <p className="text-sm text-muted-foreground">Checking Plex account…</p>
      )}
      {model.status === 'connected' && <ConnectedAccount model={model} />}
      {showPrompt && <ConnectPrompt model={model} />}
      {model.status === 'pending' && model.code !== null && <PendingPinCode code={model.code} />}
      {model.error !== null && (
        <Alert variant="destructive" data-testid="plex-connect-error">
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
