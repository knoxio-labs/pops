import { Check, Plus, Sparkles } from 'lucide-react';

import { Button } from '@pops/ui';

import { type AcceptScope, acceptEntityLabel, type EntityExistence } from './entity-existence';

const ICONS: Record<EntityExistence, typeof Check> = {
  existing: Check,
  new: Plus,
  unknown: Sparkles,
};

const TITLES: Record<EntityExistence, (name: string) => string | undefined> = {
  existing: (name) => `"${name}" already exists — these transactions are assigned to it`,
  new: (name) => `"${name}" does not exist yet — accepting creates it`,
  unknown: () => undefined,
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
  return (
    <Button
      variant="default"
      size="sm"
      onClick={onClick}
      title={TITLES[existence](entityName)}
      className={`bg-app-accent text-app-accent-foreground hover:bg-app-accent/90 ${className ?? ''}`}
    >
      <Icon className="w-4 h-4 mr-1 shrink-0" aria-hidden="true" />
      {acceptEntityLabel(existence, scope, entityName)}
    </Button>
  );
}
