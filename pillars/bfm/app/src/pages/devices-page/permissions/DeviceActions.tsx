import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { PairedDevice } from '../useDevicesPageModel.js';

/** Shared row/card actions keep grant editing limited to live operator-owned devices. */
export function DeviceActions({
  device,
  onRevoke,
  onPermissions,
}: {
  device: PairedDevice;
  onRevoke: (device: PairedDevice) => void;
  onPermissions: (device: PairedDevice, origin: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation('bfm');
  if (device.revokedAt !== null) return null;
  return (
    <div className="flex flex-wrap gap-2 max-md:flex-col">
      {device.subjectEmail === null && (
        <Button
          variant="outline"
          className="min-h-11 max-md:w-full"
          aria-label={t('permissions.actionName', { name: device.name })}
          onClick={(event) => onPermissions(device, event.currentTarget)}
        >
          {t('permissions.action')}
        </Button>
      )}
      <Button
        variant="ghost"
        className="h-11 text-destructive hover:text-destructive max-md:w-full"
        aria-label={t('devices.revokeAction', { name: device.name })}
        onClick={() => onRevoke(device)}
      >
        {t('devices.revoke')}
      </Button>
    </div>
  );
}
