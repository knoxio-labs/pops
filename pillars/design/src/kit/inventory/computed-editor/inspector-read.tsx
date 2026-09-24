import { ChevronRight, Plus, Route, X } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Label,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
} from '@pops/ui';

import { findType, isFollowable, referenceTargets, resolveRead } from './catalogue-lookup';
import { EXPRESSION_LIMITS, valueTypeLabel } from './model';

import type { ResolvedRead } from './catalogue-lookup';
import type { DesignField, ExpressionContext, ExpressionNode, ValueType } from './model';

function followBlockedReason(field: DesignField): string | null {
  if (isFollowable(field)) return null;
  if (field.cardinality === 'many') return 'holds many items';
  return 'can point to a location';
}

function targetText(context: ExpressionContext, field: DesignField): string {
  if ((field.reference?.typeIds.length ?? 0) === 0) return 'to any type';
  return `to ${referenceTargets(context, field)
    .map((type) => type.label)
    .join(', ')}`;
}

function ReferenceChoices({
  context,
  fields,
}: {
  context: ExpressionContext;
  fields: readonly DesignField[];
}) {
  return (
    <ul className="space-y-1 rounded-md border p-1" aria-label="References to follow">
      {fields.map((field) => {
        const blocked = followBlockedReason(field);
        return (
          <li key={field.id}>
            <button
              type="button"
              disabled={blocked !== null}
              className="flex min-h-9 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-muted disabled:opacity-60"
            >
              <span>{field.label}</span>
              <span className="text-xs text-muted-foreground">
                {blocked === null ? targetText(context, field) : `Cannot follow: ${blocked}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function HopLimitNotice({
  resolved,
  references,
}: {
  resolved: ResolvedRead;
  references: readonly DesignField[];
}) {
  const next = references[0];
  return (
    <Alert>
      <Route />
      <AlertTitle>Reads stop at two references</AlertTitle>
      <AlertDescription>
        {next === undefined
          ? `${resolved.ownerType.label} has no references to follow.`
          : `To reach past ${next.label}, add a computed field on ${resolved.ownerType.label} that reads it, then read that field here.`}
      </AlertDescription>
    </Alert>
  );
}

function matchesType(field: DesignField, expected: ValueType | undefined): boolean {
  if (expected === undefined) return field.cardinality === 'one';
  return (
    field.cardinality === 'one' && field.kind === expected.kind && field.unit === expected.unit
  );
}

/**
 * Edits a read: the chain of item references it follows (at most two) and the
 * field it lands on. Only fields that fit the slot are offered.
 */
export function ReadInspector({
  context,
  node,
  expected,
  followOpen,
}: {
  context: ExpressionContext;
  node: Extract<ExpressionNode, { op: 'read' }>;
  expected: ValueType | undefined;
  followOpen: boolean;
}) {
  const resolved = resolveRead(context, node);
  const atLimit = resolved.hops.length >= EXPRESSION_LIMITS.hops;
  const references = resolved.ownerType.fields.filter((field) => field.kind === 'reference');
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Read from</Label>
        <ReferencePath context={context} resolved={resolved} atLimit={atLimit} />
        <p className="text-xs text-muted-foreground">
          {resolved.hops.length} of {EXPRESSION_LIMITS.hops} references followed
          {atLimit && '. A read can follow at most two, so this is as far as it goes.'}
        </p>
        {followOpen && !atLimit && <ReferenceChoices context={context} fields={references} />}
        {followOpen && atLimit && <HopLimitNotice resolved={resolved} references={references} />}
      </div>
      <FieldPicker resolved={resolved} fieldId={node.fieldId} expected={expected} />
    </div>
  );
}

function ReferencePath({
  context,
  resolved,
  atLimit,
}: {
  context: ExpressionContext;
  resolved: ResolvedRead;
  atLimit: boolean;
}) {
  const owner = findType(context, context.ownerTypeId);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label="Reference path">
      <li>
        <Badge variant="outline" className="min-h-8 font-normal">
          This {owner.label} item
        </Badge>
      </li>
      {resolved.hops.map((hop) => (
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
              className="ml-1 rounded p-0.5 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </li>
      ))}
      <li className="flex items-center gap-1">
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Button variant="outline" size="sm" className="min-h-8" disabled={atLimit}>
          <Plus className="h-3.5 w-3.5" />
          Follow a reference
        </Button>
      </li>
    </ol>
  );
}

function FieldPicker({
  resolved,
  fieldId,
  expected,
}: {
  resolved: ResolvedRead;
  fieldId: string;
  expected: ValueType | undefined;
}) {
  const fitting = resolved.ownerType.fields.filter((field) => matchesType(field, expected));
  const options = resolved.ownerType.fields.filter(
    (field) => field.id === fieldId || matchesType(field, expected)
  );
  return (
    <div className="space-y-2">
      <Label>Field on {resolved.ownerType.label}</Label>
      <SelectPrimitive defaultValue={fieldId}>
        <SelectTrigger className="min-h-11 w-full">
          <SelectValue />
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
        {fitting.length} of {resolved.ownerType.fields.length} fields fit
        {expected === undefined ? '' : ` ${valueTypeLabel(expected)}`}. Fields holding many values
        cannot be read.
      </p>
    </div>
  );
}
