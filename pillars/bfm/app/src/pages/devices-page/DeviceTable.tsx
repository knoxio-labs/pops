import { Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Badge,
  Button,
  Card,
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

/**
 * Renders touch-friendly device cards below the medium breakpoint and the
 * full device table above it.
 */
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
    <>
      <ul aria-label={t('devices.title')} className="space-y-3 md:hidden">
        {list.devices.map((device) => (
          <DeviceCard key={device.id} device={device} onRevoke={onRevoke} />
        ))}
      </ul>
      <div className="hidden md:block" data-testid="device-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('devices.column.name')}</TableHead>
              <TableHead>{t('devices.column.model')}</TableHead>
              <TableHead>{t('devices.column.owner')}</TableHead>
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
      </div>
    </>
  );
}

function DeviceCard({
  device,
  onRevoke,
}: {
  device: PairedDevice;
  onRevoke: (device: PairedDevice) => void;
}): ReactElement {
  const { t } = useTranslation('bfm');
  const { revokedAt } = device;

  return (
    <li>
      <Card
        data-device-id={device.id}
        data-revoked={revokedAt !== null}
        className="w-full gap-4 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-medium">{device.name}</h3>
            <p className="break-words text-sm text-muted-foreground">{device.model}</p>
            <p className="break-all text-sm text-muted-foreground">
              {device.subjectEmail ?? t('devices.owner.operator')}
            </p>
          </div>
          <DeviceStateBadge revokedAt={revokedAt} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            {t('devices.column.paired')}: {formatDate(device.createdAt)}
          </span>
          <span>
            {t('devices.column.lastSeen')}: {formatRelativeTime(device.lastSeenAt)}
          </span>
        </div>
        {revokedAt === null ? (
          <Button
            className="h-11 w-full text-destructive hover:text-destructive"
            aria-label={t('devices.revokeAction', { name: device.name })}
            onClick={() => onRevoke(device)}
          >
            {t('devices.revoke')}
          </Button>
        ) : null}
      </Card>
    </li>
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
      <TableCell className="text-muted-foreground">
        {device.subjectEmail ?? t('devices.owner.operator')}
      </TableCell>
      <TableCell className="text-muted-foreground">{formatDate(device.createdAt)}</TableCell>
      <TableCell className="text-muted-foreground">
        {formatRelativeTime(device.lastSeenAt)}
      </TableCell>
      <TableCell>
        <DeviceStateBadge revokedAt={revokedAt} />
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

function DeviceStateBadge({ revokedAt }: { revokedAt: string | null }): ReactElement {
  const { t } = useTranslation('bfm');

  return revokedAt === null ? (
    <Badge variant="secondary">{t('devices.state.trusted')}</Badge>
  ) : (
    <Badge variant="destructive">
      {t('devices.state.revoked', { when: formatDate(revokedAt) })}
    </Badge>
  );
}
