import type { ExpressionContext, ExpressionField, ExpressionType, ReadNode } from './model.js';

/** One followed reference in a read path, and the type it lands on. */
export interface ResolvedHop {
  readonly field: ExpressionField;
  readonly target: ExpressionType;
}

/** A read resolved against the catalogue: the hops it follows and the field it ends on. */
export interface ResolvedRead {
  readonly hops: readonly ResolvedHop[];
  readonly field: ExpressionField | undefined;
  readonly ownerType: ExpressionType;
}

const UNKNOWN_TYPE: ExpressionType = { id: '', label: 'Unknown type', fields: [] };

/** Finds a catalogue type by id. */
export function findType(context: ExpressionContext, typeId: string): ExpressionType | undefined {
  return context.types.find((candidate) => candidate.id === typeId);
}

/** The type that owns the expression being edited. */
export function ownerType(context: ExpressionContext): ExpressionType {
  return findType(context, context.ownerTypeId) ?? UNKNOWN_TYPE;
}

/**
 * Whether a field can be followed by a read: a one-cardinality reference to
 * items only. A reference that may point at a location cannot be followed.
 */
export function isFollowable(field: ExpressionField): boolean {
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
  field: ExpressionField
): readonly ExpressionType[] {
  const ids = field.reference?.typeIds ?? [];
  if (ids.length === 0) return context.types;
  return ids.flatMap((id) => findType(context, id) ?? []);
}

function hopTarget(
  context: ExpressionContext,
  field: ExpressionField,
  nextId: string
): ExpressionType {
  const targets = referenceTargets(context, field);
  return (
    targets.find((type) => type.fields.some((entry) => entry.id === nextId)) ??
    targets[0] ??
    UNKNOWN_TYPE
  );
}

/**
 * Resolves a read node's path and field against the catalogue. A hop or field
 * the catalogue no longer has resolves to an unknown type or no field rather
 * than failing, so a stale expression still renders and the server's issue
 * explains it.
 */
export function resolveRead(context: ExpressionContext, node: ReadNode): ResolvedRead {
  let current = ownerType(context);
  const hops: ResolvedHop[] = [];
  for (const [index, referenceId] of node.path.entries()) {
    const field = current.fields.find((candidate) => candidate.id === referenceId);
    if (field === undefined) return { hops, field: undefined, ownerType: UNKNOWN_TYPE };
    const target = hopTarget(context, field, node.path[index + 1] ?? node.fieldId);
    hops.push({ field, target });
    current = target;
  }
  return {
    hops,
    field: current.fields.find((candidate) => candidate.id === node.fieldId),
    ownerType: current,
  };
}

/** "Part of › Replacement quote" style label for a read. */
export function readLabel(context: ExpressionContext, node: ReadNode): string {
  const resolved = resolveRead(context, node);
  return [
    ...resolved.hops.map((hop) => hop.field.label),
    resolved.field?.label ?? 'Unknown field',
  ].join(' › ');
}
