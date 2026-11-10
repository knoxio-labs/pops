import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ContactPointInput } from '../contacts-api/types.gen';
import type { ContactGateway } from './api';

/** Load an entity and retain local edits until a successful write or undo. */
export function useEntityDetails(id: string, gateway: ContactGateway) {
  const key = ['contacts-entity', id];
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => gateway.load(id),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { name, notes, setName, setNotes, undoDetails } = useEntityDraft();
  const { saving, error, write } = useEntityWrite(query.isFetching || query.isError);
  const data = query.data;
  const currentName = name ?? data?.entity.name ?? '';
  const currentNotes = notes ?? data?.entity.notes ?? '';
  const dirty = data
    ? currentName !== data.entity.name || currentNotes !== (data.entity.notes ?? '')
    : false;

  async function addPoint(point: ContactPointInput) {
    if (!data) return false;
    return write(
      () => gateway.addPoint(id, point),
      (receipt) => client.setQueryData(key, { ...data, points: [...data.points, receipt] })
    );
  }

  async function addAddress(value: string) {
    if (!data) return false;
    return write(
      () => gateway.addAddress(id, value),
      (receipt) => client.setQueryData(key, { ...data, addresses: [...data.addresses, receipt] })
    );
  }

  async function saveDetails() {
    if (!data) return;
    await write(
      () => gateway.update(id, currentName, currentNotes),
      (entity) => {
        client.setQueryData(key, { ...data, entity });
        setName(null);
        setNotes(null);
      }
    );
  }

  return {
    query,
    data,
    error: error ?? query.error,
    saving,
    currentName,
    currentNotes,
    dirty,
    addPoint,
    addAddress,
    saveDetails,
    undoDetails,
    changeName: setName,
    changeNotes: setNotes,
  };
}

/** State and actions consumed by the entity detail sections. */
export type EntityDetailsModel = ReturnType<typeof useEntityDetails>;

function useEntityWrite(unavailable: boolean) {
  const { t } = useTranslation('contacts');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function write<T>(request: () => Promise<T>, accept: (receipt: T) => void) {
    if (saving || unavailable) return false;
    setSaving(true);
    setError(null);
    try {
      accept(await request());
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(t('errors.saveFailed')));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, write };
}

function useEntityDraft() {
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  function undoDetails() {
    setName(null);
    setNotes(null);
  }

  return { name, notes, setName, setNotes, undoDetails };
}
