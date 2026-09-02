import { ImportWarningBanner } from '@pops/app-finance/design';
import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ComponentProps } from 'react';

export const meta: ScreenMeta = { title: 'Import warnings', order: 2 };

type Warning = ComponentProps<typeof ImportWarningBanner>['warning'];

const DISABLED: Warning = {
  type: 'AI_CATEGORIZATION_UNAVAILABLE',
  message: 'The categorizer is switched off for this deployment.',
  affectedCount: 12,
};

const API_ERROR: Warning = {
  type: 'AI_API_ERROR',
  message: 'The categorizer answered with an error and the run continued without it.',
  details: 'provider returned 429 after 3 attempts',
  affectedCount: 16,
};

/**
 * The warning banner as the import flow actually shows it — the real
 * component from `@pops/app-finance`, not a look-alike, so the review is of
 * the shipping thing. Only the warnings are fixtures.
 */
function Screen({ warnings }: { warnings: readonly Warning[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <PageHeader title="Import warnings" description="What the importer could not settle alone." />
      {warnings.map((warning) => (
        <ImportWarningBanner
          key={warning.type}
          warning={warning}
          affectedHint=" and are waiting on you."
        />
      ))}
    </div>
  );
}

export default function ImportWarnings() {
  return <Screen warnings={[DISABLED, API_ERROR]} />;
}

export const states: ScreenStates = {
  single: () => <Screen warnings={[DISABLED]} />,
  empty: () => <Screen warnings={[]} />,
};
