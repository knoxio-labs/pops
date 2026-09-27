import { ButtonPrimitive, cn } from '@pops/ui';

import { SEARCH_SCOPE_LABELS, type SearchScope } from './search-model';

import type { ReactElement } from 'react';

/** Props for the count-aware inventory search scope radio chip. */
export interface ScopeChipProps {
  id: SearchScope;
  count: number | null;
  active: boolean;
  onScope?: (scope: SearchScope) => void;
}

/** Renders one inventory search scope as an accessible radio chip. */
export function ScopeChip({ id, count, active, onScope }: ScopeChipProps): ReactElement {
  return (
    <ButtonPrimitive
      role="radio"
      aria-checked={active}
      variant="ghost"
      size="xs"
      className={cn(
        'h-7 gap-1.5 px-2.5 text-xs',
        active
          ? 'bg-background text-foreground shadow-sm hover:bg-background'
          : 'text-muted-foreground'
      )}
      onClick={() => onScope?.(id)}
    >
      {SEARCH_SCOPE_LABELS[id]}
      {count === null ? null : <span className="tabular-nums text-muted-foreground">{count}</span>}
    </ButtonPrimitive>
  );
}
