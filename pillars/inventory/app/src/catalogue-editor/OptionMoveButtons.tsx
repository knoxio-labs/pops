import { ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@pops/ui';

/** Adjacent up/down reorder controls for one enum option row. */
export function OptionMoveButtons({
  disabled,
  isFirst,
  isLast,
  label,
  onMove,
}: {
  readonly disabled: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly label: string;
  readonly onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Move ${label} up`}
        disabled={disabled || isFirst}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Move ${label} down`}
        disabled={disabled || isLast}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
