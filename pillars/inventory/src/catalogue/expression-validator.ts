import {
  assertAcyclicExpressionGraph,
  buildExpressionDependencyGraph,
  uniqueExpressionDependencies,
} from './expression-dependencies.js';
import { parseExpression } from './expression-parser.js';
import { inferExpressionType } from './expression-type-validator.js';
import { expressionFail, expressionValueType } from './expression-validation-shared.js';

import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';
import type { ExpressionV1, ValidatedExpression } from './expression-types.js';
import type { ExpressionValidationContext } from './expression-validation-shared.js';

const MAX_EXPRESSION_DEPENDENCIES = 32;

function parseFieldExpression(field: PersistedItemTypeField): ExpressionV1 {
  if (field.expressionVersion === null || field.expressionJson === null)
    expressionFail(
      field.id,
      'computed_expression_required',
      'computed fields require an expression'
    );
  let encoded: unknown;
  try {
    encoded = JSON.parse(field.expressionJson);
  } catch {
    return expressionFail(field.id, 'expression_json_invalid', 'expression is not valid JSON');
  }
  return parseExpression(field.expressionVersion, encoded);
}

function validateFieldExpression(
  catalogue: PersistedCatalogue,
  ownerType: PersistedItemType,
  field: PersistedItemTypeField
): ValidatedExpression {
  if (field.cardinality !== 'one')
    expressionFail(field.id, 'computed_many_forbidden', 'computed fields must use one cardinality');
  const ast = parseFieldExpression(field);
  const context: ExpressionValidationContext = { catalogue, ownerType, dependencies: [] };
  const resultType = inferExpressionType(ast, context, 'expression', expressionValueType(field));
  const dependencies = uniqueExpressionDependencies(context.dependencies);
  if (dependencies.length > MAX_EXPRESSION_DEPENDENCIES)
    expressionFail(
      field.id,
      'expression_dependencies_exceeded',
      'may declare at most 32 dependencies'
    );
  return { ast, dependencies, field: { typeId: ownerType.id, fieldId: field.id }, resultType };
}

/** Parses, type-checks and cycle-checks every computed expression in a catalogue snapshot. */
export function validateCatalogueExpressions(
  catalogue: PersistedCatalogue
): readonly ValidatedExpression[] {
  const expressions = catalogue.types.flatMap((ownerType) =>
    ownerType.fields
      .filter((field) => field.storage === 'computed')
      .map((field) => validateFieldExpression(catalogue, ownerType, field))
  );
  assertAcyclicExpressionGraph(buildExpressionDependencyGraph(expressions));
  return expressions;
}
