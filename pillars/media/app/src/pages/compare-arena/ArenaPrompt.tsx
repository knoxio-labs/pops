import { useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

interface ArenaPromptProps {
  dimensionName: string;
  dimensionDescription: string | null;
}

export function ArenaPrompt({ dimensionName, dimensionDescription }: ArenaPromptProps) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  return (
    <div className="text-center text-muted-foreground text-sm">
      <p>
        Which movie has better{' '}
        {dimensionDescription ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="hidden font-medium text-foreground underline decoration-dotted cursor-help sm:inline">
                  {dimensionName}
                </span>
              </TooltipTrigger>
              <TooltipContent>{dimensionDescription}</TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={() => setDescriptionOpen((open) => !open)}
              aria-label={`${descriptionOpen ? 'Hide' : 'Show'} description for ${dimensionName}`}
              aria-expanded={descriptionOpen}
              aria-controls="arena-dimension-description"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline decoration-dotted sm:hidden"
            >
              {dimensionName}
            </button>
          </>
        ) : (
          <span className="font-medium text-foreground">{dimensionName}</span>
        )}
        ?
      </p>
      {dimensionDescription && (
        <p
          id="arena-dimension-description"
          hidden={!descriptionOpen}
          className="mx-auto max-w-prose text-xs text-muted-foreground sm:hidden"
        >
          {dimensionDescription}
        </p>
      )}
    </div>
  );
}
