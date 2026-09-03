import { type ImportRow, importRows } from '@/fixtures/import-review';
import { ImportReview } from '@/screens/finance/import-review';

import { choiceOf } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Review', order: 3, frame: 'web' };

const AMEX = choiceOf('a2', 'amex-csv');

/**
 * The review step composes `finance/import-review` rather than restating it,
 * so the row design stays in one place and its density experiment keeps
 * deciding it. All this step adds is the account and format the rows were
 * read under, which the leaf screen has no way to know.
 */
function Step({ rows }: { rows: ImportRow[] }) {
  return (
    <div className="space-y-4 pt-6">
      <div className="mx-auto max-w-3xl px-6">
        <ImportContextStrip choice={AMEX} />
      </div>
      <ImportReview rows={rows} />
    </div>
  );
}

export default function ImportReviewStep() {
  return <Step rows={importRows} />;
}

export const states: ScreenStates = {
  'needs-decision': () => <Step rows={importRows.filter((row) => row.status !== 'matched')} />,
  'all-matched': () => <Step rows={importRows.map((row) => ({ ...row, status: 'matched' }))} />,
  empty: () => <Step rows={[]} />,
};
