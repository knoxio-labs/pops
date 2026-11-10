import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, SearchPickerDialog } from '@pops/ui';

import { contactGateway } from './api';
import { useContactSelection } from './useContactSelection';

import type { TFunction } from 'i18next';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactGateway, ContactReference } from './api';

/** Controlled entity chooser whose selection is refreshed to a canonical entity before it reaches the host. */
export interface ContactPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entity: Entity, reference: ContactReference) => void;
  /** Report the entered name to the owning flow without creating an entity. */
  onCreate?: (name: string) => void;
  entityType?: string;
  allowCreate?: boolean;
  gateway?: ContactGateway;
  /** Search text restored when a host returns from its creation step. */
  initialSearch?: string;
  /** Host intent identity; replacement invalidates pending resolution without selecting into the new intent. */
  selectionIntent?: object;
}

/** Search existing contacts or hand an explicit create intent to the owning flow. */
export function ContactPicker({
  open,
  onOpenChange,
  onSelect,
  onCreate,
  entityType,
  allowCreate = true,
  gateway = contactGateway,
  initialSearch = '',
  selectionIntent,
}: ContactPickerProps) {
  const { t } = useTranslation('contacts');
  const [search, setSearch] = useState(initialSearch);
  const { selecting, failedSelection, select, changeOpen, clear } = useContactSelection({
    open,
    gateway,
    onSelect,
    onOpenChange,
    intent: selectionIntent,
  });
  const query = useQuery({
    queryKey: ['contacts-picker-search', search.trim(), entityType],
    queryFn: () => gateway.search(search.trim(), entityType),
    enabled: open && search.trim().length > 0,
    retry: false,
  });

  function retry() {
    if (failedSelection) void select(failedSelection);
    else void query.refetch();
  }

  function changeSearch(value: string) {
    setSearch(value);
    clear();
  }

  return (
    <ContactPickerDialog
      t={t}
      open={open}
      onOpenChange={changeOpen}
      search={search}
      onSearchChange={changeSearch}
      results={query.data ?? []}
      isLoading={query.isFetching || selecting}
      errorMessage={
        (failedSelection && !selecting) || query.isError ? t('picker.failed') : undefined
      }
      onRetry={retry}
      onSelect={select}
      onCreate={allowCreate ? onCreate : undefined}
      selecting={selecting}
    />
  );
}

function ContactPickerDialog({
  t,
  open,
  onOpenChange,
  search,
  onSearchChange,
  results,
  isLoading,
  errorMessage,
  onRetry,
  onSelect,
  onCreate,
  selecting,
}: {
  t: TFunction<'contacts'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (search: string) => void;
  results: Entity[];
  isLoading: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onSelect: (entity: Entity) => void;
  onCreate?: (name: string) => void;
  selecting: boolean;
}) {
  const createAction = onCreate ? (
    <CreateContactAction t={t} search={search} onCreate={onCreate} />
  ) : undefined;
  return (
    <SearchPickerDialog
      trigger={
        <Button variant="outline" className="min-h-11">
          {t('picker.open')}
        </Button>
      }
      open={open}
      onOpenChange={onOpenChange}
      title={t('picker.title')}
      description={t('picker.description')}
      searchPlaceholder={t('picker.search')}
      searchLabel={t('picker.search')}
      search={search}
      onSearchChange={onSearchChange}
      minChars={1}
      minCharsMessage={t('picker.minimum')}
      isLoading={isLoading}
      results={results}
      getResultKey={(entity) => entity.id}
      emptyMessage={t('picker.empty')}
      errorMessage={errorMessage}
      onRetry={onRetry}
      trailing={createAction}
      renderResult={(entity) => (
        <ContactPickerResult entity={entity} selecting={selecting} onSelect={onSelect} />
      )}
    />
  );
}

function CreateContactAction({
  t,
  search,
  onCreate,
}: {
  t: TFunction<'contacts'>;
  search: string;
  onCreate: (name: string) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 whitespace-nowrap"
      disabled={search.trim().length === 0}
      onClick={() => onCreate(search.trim())}
    >
      {t('picker.create')}
    </Button>
  );
}

function ContactPickerResult({
  entity,
  selecting,
  onSelect,
}: {
  entity: Entity;
  selecting: boolean;
  onSelect: (entity: Entity) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={selecting}
      className="min-h-11 min-w-11 w-full justify-between gap-3 px-3 text-left"
      onClick={() => onSelect(entity)}
    >
      <span className="min-w-0 truncate">{entity.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{entity.type}</span>
    </Button>
  );
}
