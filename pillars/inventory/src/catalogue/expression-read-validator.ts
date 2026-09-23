import {
  expressionFail,
  expressionValueType,
  requireExpressionType,
} from './expression-validation-shared.js';

import type { PersistedItemType, PersistedItemTypeField } from './catalogue-types.js';
import type { ExpressionV1, ExpressionValueType } from './expression-types.js';
import type { ExpressionValidationContext } from './expression-validation-shared.js';

function findField(type: PersistedItemType, fieldId: string, path: string): PersistedItemTypeField {
  return (
    type.fields.find((field) => field.id === fieldId) ??
    expressionFail(
      path,
      'expression_field_unknown',
      `field ${fieldId} is not present on ${type.id}`
    )
  );
}

function targetTypes(
  field: PersistedItemTypeField,
  context: ExpressionValidationContext,
  path: string
): readonly PersistedItemType[] {
  if (
    field.kind !== 'reference' ||
    field.cardinality !== 'one' ||
    field.referenceKinds.size !== 1 ||
    !field.referenceKinds.has('item')
  )
    return expressionFail(
      path,
      'expression_path_not_item_reference',
      'must name a one item-reference field'
    );
  if (field.referenceTypeIds.size === 0) return context.catalogue.types;
  return [...field.referenceTypeIds].map(
    (id) =>
      context.catalogue.types.find((candidate) => candidate.id === id) ??
      expressionFail(path, 'expression_type_unknown', `target type ${id} is not present`)
  );
}

function traverse(
  node: Extract<ExpressionV1, { op: 'read' }>,
  context: ExpressionValidationContext,
  path: string
): readonly PersistedItemType[] {
  let currentTypes: readonly PersistedItemType[] = [context.ownerType];
  for (const [index, referenceFieldId] of node.path.entries()) {
    const nextTypes = new Map<string, PersistedItemType>();
    for (const currentType of currentTypes) {
      const reference = findField(currentType, referenceFieldId, `${path}.path.${index}`);
      context.dependencies.push({
        typeId: currentType.id,
        fieldId: reference.id,
        via: node.path.slice(0, index),
      });
      for (const target of targetTypes(reference, context, `${path}.path.${index}`))
        nextTypes.set(target.id, target);
    }
    currentTypes = [...nextTypes.values()];
  }
  return currentTypes;
}

/** Resolves a read against every statically possible target type. */
export function inferReadType(
  node: Extract<ExpressionV1, { op: 'read' }>,
  context: ExpressionValidationContext,
  path: string
): ExpressionValueType {
  const fields = traverse(node, context, path).map((type) => {
    const field = findField(type, node.fieldId, `${path}.fieldId`);
    context.dependencies.push({ typeId: type.id, fieldId: field.id, via: node.path });
    return field;
  });
  const first = fields[0] ?? expressionFail(path, 'expression_type_unknown', 'has no target type');
  const result = expressionValueType(first);
  for (const field of fields.slice(1))
    requireExpressionType(expressionValueType(field), result, path);
  if (fields.some((field) => field.cardinality !== 'one'))
    expressionFail(path, 'expression_many_read', 'may only read one-cardinality fields');
  return result;
}
