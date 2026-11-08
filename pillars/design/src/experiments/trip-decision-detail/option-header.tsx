import { Check, MoreHorizontal, Trash2 } from 'lucide-react';

import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { useDecision } from './context';
import { DecisionText } from './fields';
import { removeDecisionOption, selectDecisionOption } from './model';

import type { DecisionState } from './model';

type Option = DecisionState['options'][number];

/** Option name, choice and removal controls share the decision history. */
export function OptionHeader({
  option,
  index,
  update,
}: {
  option: Option;
  index: number;
  update: (next: Option) => void;
}) {
  const { state, change } = useDecision();
  const selected = state.selectedOptionId === option.id;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <DecisionText
          heading
          value={option.title}
          label={`Option ${index + 1} name`}
          onCommit={(title) => update({ ...option, title })}
        />
      </div>
      {selected ? (
        <Badge className="min-h-11 gap-1 bg-app-accent px-3 text-app-accent-foreground">
          <Check className="size-4" aria-hidden />
          Selected
        </Badge>
      ) : (
        <Button
          variant="outline"
          aria-label={`Choose ${option.title || `option ${index + 1}`}`}
          onClick={() => change(selectDecisionOption(state, option.id))}
        >
          Choose<span className="sr-only"> {option.title || `option ${index + 1}`}</span>
        </Button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" aria-label={`Option ${index + 1} actions`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive"
            onClick={() => change(removeDecisionOption(state, option.id))}
          >
            <Trash2 className="size-4" aria-hidden />
            Remove option
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
