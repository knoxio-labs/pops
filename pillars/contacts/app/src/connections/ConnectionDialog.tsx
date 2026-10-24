import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { describeContactError } from '../errors';
import { ScanDetails } from './ScanDetails';
import { SetupForm } from './SetupForm';
import { useConnectionActions } from './useConnectionActions';

import type { ContactConnection, ConnectionsGateway } from './contracts';
import type { ConnectionDialogOptions } from './contracts';

/** A setup or management modal keeps credentials out of query state and persisted caches. */
export function ConnectionDialog(options: ConnectionDialogOptions) {
  const { provider, account, gateway, onClose } = options;
  const { t } = useTranslation('contacts');
  const actions = useConnectionActions(options);
  const connected = account?.connected === true && !account.reauthorizationRequired;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !actions.pending) onClose();
      }}
    >
      <DialogContent className="space-y-2 md:max-w-xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-semibold">
            {t(connected ? 'connections.manage' : 'connections.connect', {
              provider: t(`connections.providers.${provider}`),
            })}
          </DialogTitle>
          <DialogDescription className="text-base leading-7 text-foreground/85">
            {t(connected ? 'connections.manageHint' : 'connections.setupHint')}
          </DialogDescription>
        </DialogHeader>
        {actions.error && (
          <p role="alert" className="text-destructive">
            {describeContactError(actions.error, t)}
          </p>
        )}
        {connected && account ? (
          <ManageConnection
            account={account}
            gateway={gateway}
            runId={actions.runId}
            pending={actions.pending}
            onStart={actions.start}
            onDisconnect={actions.disconnect}
          />
        ) : (
          <SetupForm
            provider={provider}
            account={account}
            pending={actions.pending}
            onCancel={onClose}
            onGoogle={actions.authorize}
            onIcloud={actions.connect}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManageConnection({
  account,
  gateway,
  runId,
  pending,
  onStart,
  onDisconnect,
}: {
  account: ContactConnection;
  gateway: ConnectionsGateway;
  runId: string | null;
  pending: boolean;
  onStart: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-5">
        <p className="break-words text-base font-semibold">
          {account.label ?? t(`connections.providers.${account.provider}`)}
        </p>
        <p className="text-sm leading-6">{t('connections.readOnly')}</p>
        {account.includeOtherContacts && <p>{t('connections.otherIncluded')}</p>}
      </div>
      {runId && <ScanDetails runId={runId} gateway={gateway} />}
      {account.previewRunId && account.previewRunId !== runId && (
        <ScanDetails runId={account.previewRunId} gateway={gateway} previous />
      )}
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onDisconnect}>
          {t('connections.disconnect')}
        </Button>
        <Button disabled={pending} onClick={onStart}>
          {t('connections.prepare')}
        </Button>
      </DialogFooter>
      <p className="text-sm leading-6 text-foreground/85">{t('connections.retained')}</p>
    </div>
  );
}
