import { QrCode as QrCodeIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, PageHeader } from '@pops/ui';

import { DeviceTable } from './devices-page/DeviceTable.js';
import { PairingDialog } from './devices-page/PairingDialog.js';
import { RevokeDialog } from './devices-page/RevokeDialog.js';
import { useDevicesPageModel } from './devices-page/useDevicesPageModel.js';

import type { ReactElement } from 'react';

/**
 * `/bfm` — the operator's device surface: mint a pairing code, see what is
 * paired, cut a handset off.
 *
 * It lives in the shell, behind Cloudflare Access, and that placement is the
 * feature: bfm's own hostname has Access bypassed so an unpaired phone can
 * reach `POST /devices/pair`, so the shell is the only surface where "only the
 * operator can mint a code" is structurally true rather than merely intended.
 */
export function DevicesPage(): ReactElement {
  const { t } = useTranslation('bfm');
  const { list, pairing, revocation } = useDevicesPageModel();
  const [isPairingOpen, setIsPairingOpen] = useState(false);

  const openPairing = (): void => {
    setIsPairingOpen(true);
    pairing.mint();
  };

  const closePairing = (): void => {
    setIsPairingOpen(false);
    pairing.dismiss();
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={t('devices.title')}
        description={t('devices.intro')}
        actions={
          <Button onClick={openPairing} prefix={<QrCodeIcon className="h-4 w-4" />}>
            {t('pairing.action')}
          </Button>
        }
      />

      <DeviceTable list={list} onRevoke={revocation.request} />

      <PairingDialog
        pairing={pairing}
        open={isPairingOpen}
        onOpenChange={(open) => (open ? setIsPairingOpen(true) : closePairing())}
      />
      <RevokeDialog revocation={revocation} />
    </div>
  );
}
