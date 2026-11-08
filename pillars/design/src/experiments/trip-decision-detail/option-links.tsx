import { Link2 } from 'lucide-react';

import { Button, CheckboxInput, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { useDecision } from './context';

import type { DecisionState } from './model';

type Option = DecisionState['options'][number];

/** Associate existing plans without editing or deleting their source records. */
export function OptionLinks({
  option,
  index,
  update,
}: {
  option: Option;
  index: number;
  update: (next: Option) => void;
}) {
  const { state } = useDecision();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="mt-1 text-sm"
          aria-label={`Link plans to option ${index + 1}`}
        >
          <Link2 className="size-4" aria-hidden />
          Link plans
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <h3 className="text-sm font-semibold">Linked plans</h3>
        {state.arrangements.map((source) => (
          <CheckboxInput
            key={source.id}
            label={source.title}
            className="min-h-11 justify-center"
            checked={option.affectedIds.includes(source.id)}
            onCheckedChange={(checked) =>
              update({
                ...option,
                affectedIds: checked
                  ? [...option.affectedIds, source.id]
                  : option.affectedIds.filter((id) => id !== source.id),
              })
            }
          />
        ))}
        {option.affectedIds
          .filter((id) => !state.arrangements.some((source) => source.id === id))
          .map((id) => (
            <Button
              key={id}
              variant="ghost"
              onClick={() =>
                update({
                  ...option,
                  affectedIds: option.affectedIds.filter((value) => value !== id),
                })
              }
            >
              Unlink unavailable plan
            </Button>
          ))}
      </PopoverContent>
    </Popover>
  );
}
