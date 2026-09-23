import type { DesignField, DesignType, ExpressionContext, ExpressionNode } from './model';

/** One followed reference in a read path, and the type it lands on. */
export interface ResolvedHop {
  readonly field: DesignField;
  readonly target: DesignType;
}

/** A read resolved against the catalogue: the hops it follows and the field it ends on. */
export interface ResolvedRead {
  readonly hops: readonly ResolvedHop[];
  readonly field: DesignField;
  readonly ownerType: DesignType;
}

/** Finds a catalogue type by id, failing loudly on a fixture mistake. */
export function findType(context: ExpressionContext, typeId: string): DesignType {
  const type = context.types.find((candidate) => candidate.id === typeId);
  if (type === undefined) throw new Error(`Unknown type ${typeId}`);
  return type;
}

/** Finds a field on a type by id, failing loudly on a fixture mistake. */
export function findField(type: DesignType, fieldId: string): DesignField {
  const field = type.fields.find((candidate) => candidate.id === fieldId);
  if (field === undefined) throw new Error(`Field ${fieldId} is not on ${type.id}`);
  return field;
}

/**
 * Whether a field can be followed by a read: a one-cardinality reference to
 * items only. A reference that may point at a location cannot be followed.
 */
export function isFollowable(field: DesignField): boolean {
  return (
    field.kind === 'reference' &&
    field.cardinality === 'one' &&
    field.reference?.kinds.length === 1 &&
    field.reference.kinds[0] === 'item'
  );
}

/**
 * Every type a reference may land on: its named targets, or the whole
 * catalogue when it names none.
 */
export function referenceTargets(
  context: ExpressionContext,
  field: DesignField
): readonly DesignType[] {
  const ids = field.reference?.typeIds ?? [];
  if (ids.length === 0) return context.types;
  return ids.map((id) => findType(context, id));
}

function hopTarget(context: ExpressionContext, field: DesignField, nextId: string): DesignType {
  const targets = referenceTargets(context, field);
  const target =
    targets.find((type) => type.fields.some((entry) => entry.id === nextId)) ?? targets[0];
  if (target === undefined) throw new Error(`Reference ${field.id} has no target type`);
  return target;
}

/** Resolves a read node's path and field against the catalogue. */
export function resolveRead(
  context: ExpressionContext,
  node: Extract<ExpressionNode, { op: 'read' }>
): ResolvedRead {
  let current = findType(context, context.ownerTypeId);
  const hops: ResolvedHop[] = [];
  for (const [index, referenceId] of node.path.entries()) {
    const field = findField(current, referenceId);
    const target = hopTarget(context, field, node.path[index + 1] ?? node.fieldId);
    hops.push({ field, target });
    current = target;
  }
  return { hops, field: findField(current, node.fieldId), ownerType: current };
}

/** "Part of › Replacement quote" style label for a read. */
export function readLabel(
  context: ExpressionContext,
  node: Extract<ExpressionNode, { op: 'read' }>
): string {
  const resolved = resolveRead(context, node);
  return [...resolved.hops.map((hop) => hop.field.label), resolved.field.label].join(' › ');
}
