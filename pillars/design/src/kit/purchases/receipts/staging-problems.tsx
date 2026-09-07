import { MAX_RECEIPT_PARTS } from './parts';

import type { StagingProblem } from '@/fixtures/purchases-receipt-intake';

function message(problem: StagingProblem): string {
  switch (problem.kind) {
    case 'rejected':
      return `Not something a receipt can arrive as: ${problem.names.join(', ')}. Accepted: JPEG, PNG, WebP, GIF, PDF, or plain text.`;
    case 'unreadable':
      return `${problem.names.join(', ')} could not be read from this device.`;
    case 'tooMany':
      return `One receipt is at most ${String(MAX_RECEIPT_PARTS)} parts, so ${String(problem.dropped)} were left out. Remove a part to make room.`;
  }
}

/** What happened to the files that did not become parts of this receipt. */
export function StagingProblems({ problems }: { problems: StagingProblem[] }) {
  if (problems.length === 0) return null;

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
