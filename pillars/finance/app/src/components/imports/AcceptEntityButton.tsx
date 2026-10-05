import { Check, CircleAlert, Info, LoaderCircle, Plus } from 'lucide-react';

import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pops/ui';

import { type AcceptScope, acceptEntityLabel, type EntityExistence } from './entity-existence';

const ICONS: Record<EntityExistence, typeof Check> = {
  existing: Check,
  new: Plus,
  checking: LoaderCircle,
  unavailable: CircleAlert,
};

const TITLES: Record<EntityExistence, (name: string) => string> = {
  existing: (name) => `"${name}" already exists — these transactions are assigned to it`,
  new: (name) => `"${name}" does not exist yet — accepting creates it`,
  checking: () => 'Checking Contacts to determine whether accepting creates an entity',
  unavailable: () =>
    'Contacts is unavailable, so POPS cannot determine whether accepting creates an entity',
};

interface AcceptEntityButtonProps {
  existence: EntityExistence;
  scope: AcceptScope;
  entityName: string;
  onClick: () => void;
  className?: string;
}

/**
 * The accept button for an AI-suggested entity, on a single card or a whole
 * group. Its wording is the only place the import flow tells you whether the
 * click reuses a merchant you already have or mints a new one.
 */
export function AcceptEntityButton(props: AcceptEntityButtonProps) {
  const { existence, scope, entityName, onClick, className } = props;
  const Icon = ICONS[existence];
  const disabled = existence === 'checking' || existence === 'unavailable';
  const label = acceptEntityLabel(existence, scope, entityName);
  const explanation = TITLES[existence](entityName);
  const button = (
    <Button
      variant="default"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={`bg-app-accent text-app-accent-foreground hover:bg-app-accent/90 ${className ?? ''}`}
    >
      <Icon
        className={`w-4 h-4 mr-1 shrink-0 ${existence === 'checking' ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      {label}
    </Button>
  );

  if (disabled) {
    return (
      <TooltipProvider>
        <div className="inline-flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{button}</span>
            </TooltipTrigger>
            <TooltipContent>{explanation}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`About ${label}`}
                className="text-muted-foreground"
              >
                <Info aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{explanation}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{explanation}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
