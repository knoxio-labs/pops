import { useState, type ReactNode } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pops/ui';

import { ConnectionForm } from './connection-form';

import type { ConnectionState, ContactProvider } from './connection-model';

interface ConnectionDialogProps {
  provider: ContactProvider;
  condition: ConnectionState;
  children: ReactNode;
  onConnected: () => void;
  onDisconnected: () => void;
  notify: (message: string) => void;
}

interface ConnectedDetailsProps {
  provider: ContactProvider;
  onClose: () => void;
  onDisconnected: () => void;
  notify: (message: string) => void;
}

function ConnectedDetails({ provider, onClose, onDisconnected, notify }: ConnectedDetailsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-5">
        <p className="text-base font-semibold">owner@example.test</p>
        <p className="text-base text-foreground/85">Last synced 24 October · 6 contacts</p>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            onDisconnected();
            onClose();
            notify(`${provider} disconnected. Imported contacts are retained.`);
          }}
        >
          Disconnect
        </Button>
        <Button
          onClick={() => {
            notify(`${provider} preview ready. Review identities before importing.`);
            onClose();
          }}
        >
          Prepare import
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Opens account setup or management from a provider card. All actions are local fixtures. */
export function ConnectionDialog({
  provider,
  condition,
  children,
  onConnected,
  onDisconnected,
  notify,
}: ConnectionDialogProps) {
  const [open, setOpen] = useState(false);
  const connected = condition === 'connected';
  function connect() {
    onConnected();
    notify(`${provider} connected. Your contacts are ready to preview.`);
    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="space-y-2 md:max-w-xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-semibold">
            {connected ? `${provider} connection` : `Connect ${provider}`}
          </DialogTitle>
          <DialogDescription className="text-base leading-7 text-foreground/85">
            {connected
              ? 'Manage your account and prepare the next contact import.'
              : 'Allow read-only access to your contacts. Review matches before importing.'}
          </DialogDescription>
        </DialogHeader>
        {connected ? (
          <ConnectedDetails
            provider={provider}
            onClose={() => setOpen(false)}
            onDisconnected={onDisconnected}
            notify={notify}
          />
        ) : (
          <ConnectionForm
            provider={provider}
            condition={condition}
            onSubmit={connect}
            onCancel={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
