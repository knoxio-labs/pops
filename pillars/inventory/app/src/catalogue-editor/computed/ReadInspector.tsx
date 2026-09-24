import { ChevronRight, Plus, X } from 'lucide-react';

import {
  isFollowable,
  ownerType,
  referenceTargets,
  resolveRead,
  EXPRESSION_LIMITS,
  valueTypeLabel,
} from '@pops/inventory/expression';
import {
  Badge,
  Button,
  Label,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
} from '@pops/ui';

import { chooseReadField, fittingFields, followReference, unfollowFrom } from './builder-actions';
import { useBuilder } from './BuilderContext';
import { HopLimitNotice } from './HopLimitNotice';

import type { ResolvedRead, ExpressionField, ReadNode } from '@pops/inventory/expression';

function followBlockedReason(field: ExpressionField): string | null {
  if (isFollowable(field)) return null;
  if (field.cardinality === 'many') return 'holds many items';
  return 'can point to a location';
}

function ReferenceChoices({ fields }: { fields: readonly ExpressionField[] }) {
  const builder = useBuilder();
  const { context, root, selectedPath } = builder;
  const slot = { path: selectedPath, expected: builder.slots.get(selectedPath) };
  const targetText = (field: ExpressionField) =>
    (field.reference?.typeIds.length ?? 0) === 0
      ? 'to any type'
      : `to ${referenceTargets(context, field)
          .map((type) => type.label)
          .join(', ')}`;
  return (
    <ul className="space-y-1 rounded-md border p-1" aria-label="References to follow">
      {fields.map((field) => {
        const blocked = followBlockedReason(field);
        return (
          <li key={field.id}>
            <button
              type="button"
              disabled={blocked !== null}
              onClick={() => builder.change(followReference(context, root, slot, field))}
              className="flex min-h-11 min-w-11 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-muted disabled:opacity-60"
            >
              <span>{field.label}</span>
              <span className="text-xs text-muted-foreground">
                {blocked === null ? targetText(field) : `Cannot follow: ${blocked}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ReferencePath({ resolved }: { resolved: ResolvedRead }) {
  const builder = useBuilder();
  const { context, root, selectedPath } = builder;
  const slot = { path: selectedPath, expected: builder.slots.get(selectedPath) };
  return (
    <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label="Reference path">
      <li>
        <Badge variant="outline" className="min-h-8 font-normal">
          This {ownerType(context).label} item
        </Badge>
      </li>
      {resolved.hops.map((hop, index) => (
        <li key={hop.field.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Badge variant="outline" className="min-h-8 gap-1 font-normal">
            {hop.field.label}
            <span className="text-muted-foreground">
              ({(hop.field.reference?.typeIds.length ?? 0) === 0 ? 'any type' : hop.target.label})
            </span>
            <button
              type="button"
              aria-label={`Stop following ${hop.field.label}`}
              onClick={() => builder.change(unfollowFrom(context, root, slot, index))}
              className="relative ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted before:absolute before:-inset-3 before:content-['']"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </li>
      ))}
      <li className="flex items-center gap-1">
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Button
          variant="outline"
          size="sm"
          className="min-h-8"
          aria-expanded={builder.followOpen}
          onClick={() => builder.setFollowOpen(!builder.followOpen)}
        >
          <Plus className="h-3.5 w-3.5" />
          Follow a reference
        </Button>
      </li>
    </ol>
  );
}

function FieldPicker({ resolved, node }: { resolved: ResolvedRead; node: ReadNode }) {
  const builder = useBuilder();
  const expected = builder.slots.get(builder.selectedPath);
  const fields = resolved.ownerType.fields.filter((field) => field.archived !== true);
  const fitting = fittingFields(fields, expected);
  const options = [
    ...(resolved.field !== undefined && !fitting.includes(resolved.field) ? [resolved.field] : []),
    ...fitting,
  ];
  return (
    <div className="space-y-2">
      <Label htmlFor="read-field">Field on {resolved.ownerType.label}</Label>
      <SelectPrimitive
        value={node.fieldId}
        onValueChange={(fieldId) => {
          if (fieldId !== '')
            builder.change(chooseReadField(builder.root, builder.selectedPath, fieldId));
        }}
      >
        <SelectTrigger id="read-field" className="min-h-11 w-full">
          <SelectValue placeholder="Choose a field" />
        </SelectTrigger>
        <SelectContent>
          {options.map((field) => (
            <SelectItem key={field.id} value={field.id}>
              {field.label}
              {field.storage === 'computed' && ' (computed)'}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive>
      <p className="text-xs text-muted-foreground">
        {fitting.length} of {fields.length} fields fit
        {expected === undefined ? '' : ` ${valueTypeLabel(expected)}`}. Fields holding many values
        cannot be read.
      </p>
    </div>
  );
}

/**
 * Edits a read: the chain of item references it follows (at most two) and the
 * field it lands on. Only fields that fit the slot are offered.
 */
export function ReadInspector({ node }: { node: ReadNode }) {
  const { context, followOpen } = useBuilder();
  const resolved = resolveRead(context, node);
  const atLimit = resolved.hops.length >= EXPRESSION_LIMITS.hops;
  const references = resolved.ownerType.fields.filter(
    (field) => field.kind === 'reference' && field.archived !== true
  );
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Read from</Label>
        <ReferencePath resolved={resolved} />
        <p className="text-xs text-muted-foreground">
          {resolved.hops.length} of {EXPRESSION_LIMITS.hops} references followed
          {atLimit && '. A read can follow at most two, so this is as far as it goes.'}
        </p>
        {followOpen && !atLimit && <ReferenceChoices fields={references} />}
        {followOpen && atLimit && (
          <HopLimitNotice
            typeLabel={resolved.ownerType.label}
            nextReference={references[0]?.label}
          />
        )}
      </div>
      <FieldPicker resolved={resolved} node={node} />
    </div>
  );
}
