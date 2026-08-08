import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pops/ui';

import { REVOKE_FAILURE_KEYS } from './failure-messages.js';

import type { ReactElement } from 'react';

import type { RevocationModel } from './useDevicesPageModel.js';

/**
 * Confirmation for an irreversible cut-off, naming the device it will cut off.
 *
 * Stays open on failure: the device is still trusted until the call succeeds,
 * and a dialog that closes anyway reads as "done".
 *
 * It also refuses to close *during* the request. Cancel and the action are
 * disabled then, but Escape still reaches Radix, and letting it through would
 * be worse than useless: the DELETE is already on the wire and cannot be
 * called back, so the dialog would vanish looking cancelled while the
 * revocation went ahead — and a failure would render into a dialog that no
 * longer exists, losing the one message that says the handset is still
 * trusted. Both outcomes are terminal, so waiting costs the operator nothing.
 *
 * The refusal itself is the model's: `cancel` is a no-op while the request is
 * on the wire. Deciding it here instead would mean testing the rendered
 * `isRevoking`, which lags a commit behind the click.
 */
export function RevokeDialog({ revocation }: { revocation: RevocationModel }): ReactElement | null {
  const { t } = useTranslation('bfm');

  if (revocation.target === null) return null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && revocation.cancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('revoke.title', { name: revocation.target.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t('revoke.description')}</AlertDialogDescription>
        </AlertDialogHeader>

        {revocation.failure !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {t(REVOKE_FAILURE_KEYS[revocation.failure])}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={revocation.isRevoking}>
            {t('revoke.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={revocation.isRevoking}
            onClick={(event) => {
              // Radix closes the dialog on action-click by default. Revocation
              // can fail, and the failure has to land somewhere the operator
              // is still looking.
              event.preventDefault();
              revocation.confirm();
            }}
          >
            {revocation.isRevoking ? t('revoke.revoking') : t('revoke.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
