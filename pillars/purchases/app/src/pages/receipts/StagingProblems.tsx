import { useTranslation } from 'react-i18next';

import { MAX_RECEIPT_PARTS } from './parts.js';

import type { ReactElement } from 'react';

import type { StagingProblem } from './staging.js';

/** What happened to the files that did not become parts of this receipt. */
export function StagingProblems({ problems }: { problems: StagingProblem[] }): ReactElement | null {
  const { t } = useTranslation('purchases');
  if (problems.length === 0) return null;

  const message = (problem: StagingProblem): string => {
    switch (problem.kind) {
      case 'rejected':
        return t('receipts.problem.rejected', { names: problem.names.join(', ') });
      case 'unreadable':
        return t('receipts.problem.unreadableFile', { names: problem.names.join(', ') });
      case 'tooMany':
        return t('receipts.problem.tooMany', { max: MAX_RECEIPT_PARTS, dropped: problem.dropped });
    }
  };

  return (
    <div role="alert" className="border-destructive/50 bg-destructive/10 rounded-md border p-3">
      <ul className="space-y-1 text-sm">
        {problems.map((problem) => (
          <li key={problem.kind}>{message(problem)}</li>
        ))}
      </ul>
    </div>
  );
}
