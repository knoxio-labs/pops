import { Check } from 'lucide-react';

import { Button } from '@pops/ui';

export function RuleManagerFooter(props: {
  localOpsCount: number;
  problem: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className="flex-1 text-xs text-muted-foreground">
        {props.problem !== null && <span className="text-warning">{props.problem}</span>}
        {props.problem === null && props.localOpsCount > 0 && (
          <span>
            {props.localOpsCount} unsaved change{props.localOpsCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <Button variant="outline" onClick={props.onCancel}>
        Cancel
      </Button>
      <Button onClick={props.onSave} disabled={props.localOpsCount === 0 || props.problem !== null}>
        <Check className="h-4 w-4 mr-1.5" /> Save Changes
      </Button>
    </>
  );
}
