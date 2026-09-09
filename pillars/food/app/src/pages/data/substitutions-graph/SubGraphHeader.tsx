import { useTranslation } from 'react-i18next';
/**
 * Header controls for the substitution graph explorer.
 *
 * Scope toggle / context dropdown are controlled by URL state; the
 * search input owns local state and debounces its URL-sync by 200ms so
 * per-keystroke typing doesn't churn the data query or the browser
 * history. Deep links land with the URL's `q` value pre-populated. The
 * select + debounced input live in `SubGraphFilterControls.tsx`, split
 * out to keep this file under the `max-lines` budget.
 */
import { Link } from 'react-router';

import { ContextTagSelect, DebouncedSearchInput } from './SubGraphFilterControls';

import type { SubGraphScope } from './types';

export interface SubGraphHeaderProps {
  scope: SubGraphScope;
  onScopeChange: (scope: SubGraphScope) => void;
  contextTag: string | null;
  onContextTagChange: (tag: string | null) => void;
  availableContextTags: readonly string[];
  search: string;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  tableHref: string;
}

export function SubGraphHeader(props: SubGraphHeaderProps): React.ReactElement {
  return (
    <header className="space-y-3">
      <TitleRow onRefresh={props.onRefresh} tableHref={props.tableHref} />
      <FilterRow
        scope={props.scope}
        onScopeChange={props.onScopeChange}
        contextTag={props.contextTag}
        onContextTagChange={props.onContextTagChange}
        availableContextTags={props.availableContextTags}
        search={props.search}
        onSearchChange={props.onSearchChange}
      />
    </header>
  );
}

function TitleRow({
  onRefresh,
  tableHref,
}: {
  onRefresh: () => void;
  tableHref: string;
}): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-2xl font-semibold tracking-tight">
        {t('data.substitutions.graph.title')}
      </h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="text-foreground hover:bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
        >
          {t('data.substitutions.graph.refresh')}
        </button>
        <Link
          to={tableHref}
          className="text-foreground hover:bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
        >
          {t('data.substitutions.graph.viewAsTable')}
        </Link>
      </div>
    </div>
  );
}

interface FilterRowProps {
  scope: SubGraphScope;
  onScopeChange: (scope: SubGraphScope) => void;
  contextTag: string | null;
  onContextTagChange: (tag: string | null) => void;
  availableContextTags: readonly string[];
  search: string;
  onSearchChange: (search: string) => void;
}

function FilterRow(props: FilterRowProps): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <fieldset className="flex items-center gap-2">
        <legend className="sr-only">{t('data.substitutions.graph.scopeLabel')}</legend>
        <ScopeRadio scope="global" current={props.scope} onChange={props.onScopeChange} />
        <ScopeRadio scope="recipe" current={props.scope} onChange={props.onScopeChange} />
      </fieldset>
      <ContextTagSelect
        contextTag={props.contextTag}
        onContextTagChange={props.onContextTagChange}
        availableContextTags={props.availableContextTags}
      />
      <DebouncedSearchInput value={props.search} onChange={props.onSearchChange} />
    </div>
  );
}

function ScopeRadio({
  scope,
  current,
  onChange,
}: {
  scope: SubGraphScope;
  current: SubGraphScope;
  onChange: (scope: SubGraphScope) => void;
}): React.ReactElement {
  const { t } = useTranslation('food');
  const labelKey =
    scope === 'global'
      ? 'data.substitutions.graph.scopeGlobal'
      : 'data.substitutions.graph.scopeRecipe';
  return (
    <label className="flex items-center gap-1 text-sm">
      <input
        type="radio"
        name="sub-graph-scope"
        value={scope}
        checked={current === scope}
        onChange={() => onChange(scope)}
      />
      {t(labelKey)}
    </label>
  );
}
