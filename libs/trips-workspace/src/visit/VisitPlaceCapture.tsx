import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, ErrorState, TextInput } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { usePlaceCapture } from './use-place-capture';

import type { JSX } from 'react';

import type { VisitWorkspaceProps, VisitFieldProps } from './types';
import type { PlaceCapture } from './use-place-capture';

/** Retain acknowledged place creation independently of a failed visit association. */
export function VisitPlaceCapture({
  identity,
  commit,
  selectedPlaceId,
  reload,
}: {
  identity: VisitWorkspaceProps;
  commit: VisitFieldProps['commit'];
  selectedPlaceId: number;
  reload: () => Promise<unknown>;
}): JSX.Element {
  const { t } = useTranslation('trips');
  const [open, setOpen] = useState(false);
  const capture = usePlaceCapture(identity, commit, reload);
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        onClick={() => {
          if (!open) capture.beginNew(selectedPlaceId);
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <Plus className="size-4" aria-hidden />
        {t('visitWorkspace.newCity')}
      </Button>
      {open && (
        <PlaceForm
          capture={capture}
          selectedPlaceId={selectedPlaceId}
          close={() => setOpen(false)}
        />
      )}
    </div>
  );
}
function PlaceForm({
  capture,
  selectedPlaceId,
  close,
}: {
  capture: PlaceCapture;
  selectedPlaceId: number;
  close: () => void;
}): JSX.Element {
  const { t } = useTranslation('trips');
  const selected = selectedPlaceId === capture.created?.id;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void capture.submit();
      }}
    >
      {capture.created ? (
        <p role="status" className="text-sm">
          {capture.created.name}
          {selected ? t('visitWorkspace.selected') : ''}
        </p>
      ) : (
        <TextInput
          label={t('visitWorkspace.cityName')}
          value={capture.name}
          className="min-h-11"
          disabled={capture.busy || capture.uncertain}
          onChange={(event) => capture.setName(event.currentTarget.value)}
        />
      )}
      <Button
        type="submit"
        disabled={
          capture.busy ||
          capture.uncertain ||
          (!capture.created && !capture.name.trim()) ||
          selected
        }
      >
        {t(capture.created ? 'visitWorkspace.useCity' : 'visitWorkspace.addCity')}
      </Button>
      <Button type="button" variant="ghost" onClick={close} disabled={capture.busy}>
        {t('visitWorkspace.close')}
      </Button>
      {capture.failure !== undefined && (
        <ErrorState error={requestProblem(capture.failure)} onRetry={capture.reload} />
      )}
    </form>
  );
}
