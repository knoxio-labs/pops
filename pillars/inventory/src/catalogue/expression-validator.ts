import {
  assertAcyclicExpressionGraph,
  buildExpressionDependencyGraph,
  uniqueExpressionDependencies,
} from './expression-dependencies.js';
import { parseExpression } from './expression-parser.js';
import { inferExpressionType } from './expression-type-validator.js';
import { ExpressionValidationError } from './expression-types.js';
import { expressionFail, expressionValueType } from './expression-validation-shared.js';

import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';
import type { ExpressionV1, ValidatedExpression } from './expression-types.js';
import type { ExpressionValidationContext } from './expression-validation-shared.js';
import type { PrimitiveKind } from './value-types.js';

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
  field: PersistedItemTypeField,
  fieldKinds: ReadonlyMap<string, PrimitiveKind>
): ValidatedExpression {
  try {
    if (field.cardinality !== 'one')
      expressionFail(
        field.id,
        'computed_many_forbidden',
        'computed fields must use one cardinality'
      );
    const ast = parseFieldExpression(field);
    const version = field.expressionVersion ?? 1;
    const context: ExpressionValidationContext = {
      catalogue,
      ownerType,
      dependencies: [],
      dimensional: version >= 2,
    };
    const resultType = expressionValueType(field);
    inferExpressionType(ast, context, 'expression', resultType);
    const dependencies = uniqueExpressionDependencies(context.dependencies);
    if (dependencies.length > MAX_EXPRESSION_DEPENDENCIES)
      expressionFail(
        field.id,
        'expression_dependencies_exceeded',
        'may declare at most 32 dependencies'
      );
    return {
      ast,
      version,
      dependencies,
      field: { typeId: ownerType.id, fieldId: field.id },
      resultType,
      fieldKinds,
    };
  } catch (error) {
    if (!(error instanceof ExpressionValidationError) || error.definitionId !== null) throw error;
    const prefix = `${error.path}: `;
    const message = error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : error.message;
    throw new ExpressionValidationError(error.code, error.path, message, field.id);
  }
}

/** Parses, type-checks and cycle-checks every computed expression in a catalogue snapshot. */
export function validateCatalogueExpressions(
  catalogue: PersistedCatalogue
): readonly ValidatedExpression[] {
  const fieldKinds = new Map(
    catalogue.types.flatMap((type) =>
      type.fields.map((field): [string, PrimitiveKind] => [field.id, field.kind])
    )
  );
  const expressions = catalogue.types.flatMap((ownerType) =>
    ownerType.effectiveFields
      .filter((field) => field.storage === 'computed')
      .map((field) => validateFieldExpression(catalogue, ownerType, field, fieldKinds))
  );
  assertAcyclicExpressionGraph(buildExpressionDependencyGraph(expressions));
  return expressions;
}
