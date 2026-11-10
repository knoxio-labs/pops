import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { describeContactError } from '../errors';
import { ContactIdentityFields } from './ContactIdentityFields';

import type { useContactCreation } from './useContactCreation';

type CreationState = ReturnType<typeof useContactCreation>;

/** Contacts-owned progressive creation retains its draft and exposes explicit safe recovery. */
export function ContactCreationDialog({
  open,
  onOpenChange,
  creation,
  submit,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creation: CreationState;
  submit: () => void;
  existing: () => void;
}) {
  const { t } = useTranslation('contacts');
  const locked =
    creation.busy ||
    creation.created !== null ||
    creation.uncertain ||
    !creation.catalogue.isSuccess;
  const ready = creation.created !== null || creation.catalogue.isSuccess;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="space-y-4 md:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        <CreationStatus creation={creation} />
        <ContactIdentityFields
          name={creation.name}
          type={creation.type}
          disabled={locked}
          types={creation.catalogue.data?.types ?? []}
          changeName={creation.setName}
          changeType={creation.setType}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            disabled={creation.busy || creation.uncertain || !creation.name.trim() || !ready}
            onClick={submit}
          >
            {creation.created ? t('chooser.useCreated') : t('create.submit')}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={creation.busy}
            onClick={existing}
          >
            {t('chooser.existing')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreationStatus({ creation }: { creation: CreationState }) {
  const { t } = useTranslation('contacts');
  return (
    <>
      {creation.error && (
        <p role="alert">
          {describeContactError(creation.error, t)}
          {creation.error.messageKey === 'stale' && ` ${t('chooser.duplicate')}`}
        </p>
      )}
      {creation.uncertain && <p role="alert">{t('chooser.uncertain')}</p>}
      {creation.catalogue.isError && (
        <p role="alert">
          {describeContactError(creation.catalogue.error, t)}{' '}
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => void creation.catalogue.refetch()}
          >
            {t('chooser.retryTypes')}
          </Button>
        </p>
      )}
    </>
  );
}
