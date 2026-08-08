import { Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  formatDate,
  formatRelativeTime,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { DEVICE_LIST_FAILURE_KEYS } from './failure-messages.js';

import type { ReactElement } from 'react';

import type { DeviceListModel, PairedDevice } from './useDevicesPageModel.js';

export function DeviceTable({
  list,
  onRevoke,
}: {
  list: DeviceListModel;
  onRevoke: (device: PairedDevice) => void;
}): ReactElement {
  const { t } = useTranslation('bfm');

  if (list.state === 'loading') {
    return <Skeleton role="status" aria-label={t('devices.loading')} className="h-40 w-full" />;
  }

  if (list.state === 'failed') {
    return (
      <ErrorAlert
        title={t('devices.failure.title')}
        message={t(DEVICE_LIST_FAILURE_KEYS[list.failure ?? 'refused'])}
      />
    );
  }

  if (list.devices.length === 0) {
    return (
      <EmptyState
        icon={Smartphone}
        title={t('devices.empty.title')}
        description={t('devices.empty.description')}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('devices.column.name')}</TableHead>
          <TableHead>{t('devices.column.model')}</TableHead>
          <TableHead>{t('devices.column.paired')}</TableHead>
          <TableHead>{t('devices.column.lastSeen')}</TableHead>
          <TableHead>{t('devices.column.state')}</TableHead>
          <TableHead className="text-right">{t('devices.column.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.devices.map((device) => (
          <DeviceRow key={device.id} device={device} onRevoke={onRevoke} />
        ))}
      </TableBody>
    </Table>
  );
}

function DeviceRow({
  device,
  onRevoke,
}: {
  device: PairedDevice;
  onRevoke: (device: PairedDevice) => void;
}): ReactElement {
  const { t } = useTranslation('bfm');
  const { revokedAt } = device;

  return (
    <TableRow data-device-id={device.id} data-revoked={revokedAt !== null}>
      <TableCell className="font-medium">{device.name}</TableCell>
      <TableCell className="text-muted-foreground">{device.model}</TableCell>
      <TableCell className="text-muted-foreground">{formatDate(device.createdAt)}</TableCell>
      <TableCell className="text-muted-foreground">
        {formatRelativeTime(device.lastSeenAt)}
      </TableCell>
      <TableCell>
        {revokedAt === null ? (
          <Badge variant="secondary">{t('devices.state.trusted')}</Badge>
        ) : (
          <Badge variant="destructive">
            {t('devices.state.revoked', { when: formatDate(revokedAt) })}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {revokedAt === null ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            aria-label={t('devices.revokeAction', { name: device.name })}
            onClick={() => onRevoke(device)}
          >
            {t('devices.revoke')}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
