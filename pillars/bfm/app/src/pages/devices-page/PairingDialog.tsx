import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  QrCode,
} from '@pops/ui';

import { PAIRING_FAILURE_KEYS } from './failure-messages.js';

import type { ReactElement } from 'react';

import type { PairingCodeModel } from './usePairingCode.js';

/**
 * Remaining TTL as `m:ss`.
 *
 * Floored, so the readout reaches `0:00` only when the code is genuinely
 * spent — rounding would show a full second of `0:00` on a code that still
 * works, and, worse, `1:00` on one that no longer does.
 */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, remainingMs) / 1000);
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The minted code's only home on screen.
 *
 * A dialog rather than a panel in the page flow: bfm hands the plaintext back
 * exactly once and keeps only a digest, so the code's lifetime should be
 * visibly bounded by a thing the operator closes. Closing it drops the string.
 */
export function PairingDialog({
  pairing,
  open,
  onOpenChange,
}: {
  pairing: PairingCodeModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation('bfm');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pairing.title')}</DialogTitle>
          <DialogDescription>{t('pairing.description')}</DialogDescription>
        </DialogHeader>

        <PairingBody pairing={pairing} />

        <DialogFooter>
          {pairing.state === 'expired' || pairing.state === 'failed' ? (
            <Button onClick={pairing.mint}>{t('pairing.mintAnother')}</Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('pairing.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PairingBody({ pairing }: { pairing: PairingCodeModel }): ReactElement {
  const { t } = useTranslation('bfm');

  if (pairing.state === 'minting') {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        {t('pairing.minting')}
      </p>
    );
  }

  if (pairing.state === 'failed') {
    return (
      <p role="alert" className="py-8 text-center text-sm text-destructive">
        {t(PAIRING_FAILURE_KEYS[pairing.failure ?? 'refused'])}
      </p>
    );
  }

  if (pairing.state === 'expired' || pairing.issued === null) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        {t('pairing.expired')}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <QrCode
        value={pairing.issued.pairingUrl}
        title={t('pairing.qrLabel')}
        className="w-56 rounded-md p-3"
      />
      <p
        data-testid="pairing-code"
        className="font-mono text-2xl font-semibold tracking-widest tabular-nums"
      >
        {pairing.issued.code}
      </p>
      <p role="timer" className="text-sm text-muted-foreground">
        {t('pairing.expiresIn', { remaining: formatRemaining(pairing.remainingMs) })}
      </p>
    </div>
  );
}
