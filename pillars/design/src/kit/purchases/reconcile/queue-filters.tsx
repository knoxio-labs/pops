import { Button, CheckboxInput } from '@pops/ui';

import type { ReactElement } from 'react';

import type { QueueFilterState, QueueKind } from './types';

const KINDS: readonly (QueueKind | 'all')[] = ['all', 'proposed', 'unexplained'];

const KIND_LABEL: Record<QueueKind | 'all', string> = {
  all: 'All',
  proposed: 'Proposed',
  unexplained: 'Unexplained',
};

interface QueueFiltersProps {
  value: QueueFilterState;
  onChange: (next: QueueFilterState) => void;
}

/**
 * The two filters the queue endpoint actually distinguishes.
 *
 * `kind` separates contested charges from unexplained ones: the contract
 * treats an empty proposal set as a different state, not a weaker match.
 * `includeAuto` is off by default because a grocery source is thousands of
 * line items a year, and a queue that asks about each one gets abandoned
 * along with the orders that do need a decision (ADR-042).
 */
export function QueueFilters({ value, onChange }: QueueFiltersProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Queue filter" className="flex gap-2">
        {KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={value.kind === kind ? 'default' : 'outline'}
            aria-pressed={value.kind === kind}
            onClick={() => onChange({ ...value, kind })}
          >
            {KIND_LABEL[kind]}
          </Button>
        ))}
      </div>

      <CheckboxInput
        id="reconcile-include-auto"
        label="Include auto-linked sources"
        checked={value.includeAuto}
        onCheckedChange={(includeAuto) => onChange({ ...value, includeAuto: includeAuto === true })}
      />
    </div>
  );
}
