import { FolderTree, Tag as TagIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, ComboboxSelect } from '@pops/ui';

import { tripTitle } from '../home/model';
import { availableParents, draftIssues } from './model';

import type { LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';

import type { Trip, Tag } from '../api/types';
import type { TripDraft } from './model';

/** Independent parent and shared-tag source selectors with explicit clearing and recoverable catalogue failures. */
export function TripReferences({
  draft,
  previous,
  change,
  trips,
  tags,
  id,
  tagsFailed,
  retryTags,
  parentsFailed,
  retryParents,
}: {
  draft: TripDraft;
  previous?: TripDraft;
  change: (draft: TripDraft) => void;
  trips: Trip[] | undefined;
  tags: Tag[] | undefined;
  id?: number;
  tagsFailed: boolean;
  retryTags: () => void;
  parentsFailed: boolean;
  retryParents: () => void;
}) {
  const { t } = useTranslation('trips');
  const issues = draftIssues(draft, trips, tags, { id, previous });
  const parents = availableParents(trips ?? [], id);
  return (
    <>
      <ReferenceSection
        label={t('sharedTag')}
        icon={TagIcon}
        value={draft.tagId}
        options={(tags ?? []).map((tag) => ({ value: tag.id, label: tag.name }))}
        change={(tagId) => change({ ...draft, tagId })}
        placeholder={t('chooseTag')}
        search={t('findTag')}
        clear={t('unlinkTag')}
        invalid={issues.includes('tag') ? t('tagInvalid') : undefined}
        failure={tagsFailed ? t('tagsUnavailable') : undefined}
        retry={retryTags}
      />
      <ReferenceSection
        label={t('parent')}
        icon={FolderTree}
        value={draft.parentId}
        options={parents.map((trip) => ({
          value: String(trip.id),
          label: tripTitle(trip, t('trip')),
        }))}
        change={(parentId) => change({ ...draft, parentId })}
        placeholder={t('chooseTrip')}
        search={t('findTrip')}
        clear={t('unlinkParent')}
        invalid={issues.includes('parent') ? t('parentInvalid') : undefined}
        failure={parentsFailed ? t('parentsUnavailable') : undefined}
        retry={retryParents}
      />
    </>
  );
}
interface ReferenceProps {
  label: string;
  icon: ComponentType<LucideProps>;
  value: string;
  options: { value: string; label: string }[];
  change: (value: string) => void;
  placeholder: string;
  search: string;
  clear: string;
  invalid?: string;
  failure?: string;
  retry: () => void;
}

function ReferenceSection({
  label,
  icon: Icon,
  value,
  options,
  change,
  placeholder,
  search,
  clear,
  invalid,
  failure,
  retry,
}: ReferenceProps) {
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-app-accent" aria-hidden />
        {label}
      </h2>
      <div className="flex items-center gap-2">
        <ComboboxSelect
          aria-label={label}
          value={options.some((option) => option.value === value) ? value : ''}
          options={options}
          placeholder={placeholder}
          searchPlaceholder={search}
          className="min-h-11"
          onChange={(next) => {
            if (typeof next === 'string') change(next);
          }}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            aria-label={clear}
            className="min-h-11 min-w-11"
            onClick={() => change('')}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      {value && !options.some((option) => option.value === value) && (
        <UnavailableReference value={value} />
      )}
      <ReferenceProblems invalid={invalid} failure={failure} retry={retry} />
    </section>
  );
}

function UnavailableReference({ value }: { value: string }) {
  const { t } = useTranslation('trips');
  return (
    <p className="break-words text-sm text-muted-foreground">
      {t('referenceUnavailable', { value })}
    </p>
  );
}

function ReferenceProblems({
  invalid,
  failure,
  retry,
}: Pick<ReferenceProps, 'invalid' | 'failure' | 'retry'>) {
  const { t } = useTranslation('trips');
  return (
    <>
      {invalid && (
        <p role="alert" className="text-destructive">
          {invalid}
        </p>
      )}
      {failure && (
        <p role="status" className="text-muted-foreground">
          {failure}{' '}
          <Button type="button" variant="ghost" className="min-h-11" onClick={retry}>
            {t('retry')}
          </Button>
        </p>
      )}
    </>
  );
}
