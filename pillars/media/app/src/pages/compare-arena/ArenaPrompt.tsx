import { useState } from 'react';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

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
            <Button
              type="button"
              variant="link"
              className="px-0 font-medium text-foreground decoration-dotted sm:hidden"
              onClick={() => setDescriptionOpen((open) => !open)}
              aria-label={`${descriptionOpen ? 'Hide' : 'Show'} description for ${dimensionName}`}
              aria-expanded={descriptionOpen}
              aria-controls="arena-dimension-description"
            >
              {dimensionName}
            </Button>
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
