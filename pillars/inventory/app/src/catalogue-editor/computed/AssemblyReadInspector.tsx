import { Label } from '@pops/ui';

import { useBuilder } from './BuilderContext';
import { FieldPicker } from './FieldPicker';

import type { AssemblyReadNode } from '@pops/inventory/expression';

/**
 * Edits a read from the assembly this item is a part of. Only fields every
 * assembly type has are offered, since any of them can be the assembly.
 */
export function AssemblyReadInspector({ node }: { node: AssemblyReadNode }) {
  const { context } = useBuilder();
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Read from</Label>
        <p className="text-sm">The item this is a part of</p>
        <p className="text-xs text-muted-foreground">
          Unavailable when the item is not a part of anything. A computed field read here is worked
          out on the assembly in turn, so a field that reads itself inherits up the whole chain.
        </p>
      </div>
      <FieldPicker
        fields={context.assemblyFields ?? []}
        fieldId={node.fieldId}
        label="Field on the assembly"
      />
    </div>
  );
}
