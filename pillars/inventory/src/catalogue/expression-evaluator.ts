import { negate } from './expression-arithmetic.js';
import { binaryValue } from './expression-binary.js';
import { evaluateCoalesce } from './expression-coalesce.js';
import { convertToFixedUnit } from './expression-dimensional.js';
import { errorEvaluation, uniqueEvaluatedDependencies } from './expression-evaluation-shared.js';
import { evaluateRead } from './expression-reader.js';
import { canonicalExpressionResult } from './expression-result.js';

import type { ArithmeticResult } from './expression-arithmetic.js';
import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionSnapshot,
  ExpressionV1,
  ValidatedExpression,
} from './expression-types.js';

/** What one evaluation reads and which version's semantics it applies. */
interface EvaluationScope {
  readonly snapshot: ExpressionSnapshot;
  /** Version 2 converts and derives measurement units (ADR-002 D5). */
  readonly dimensional: boolean;
}

function evaluateBinary(
  expression: Extract<ExpressionV1, { left: ExpressionV1 }>,
  scope: EvaluationScope
): ExpressionEvaluation {
  const left = evaluateNode(expression.left, scope);
  if (left.state !== 'value') return left;
  if (expression.op === 'and' && left.value === false) return left;
  if (expression.op === 'or' && left.value === true) return left;
  const right = evaluateNode(expression.right, scope);
  if (right.state !== 'value') return mergeDependencies(right, left.dependencies);
  return binaryValue(expression.op, left.value, right.value, {
    dependencies: uniqueEvaluatedDependencies([...left.dependencies, ...right.dependencies]),
    dimensional: scope.dimensional,
  });
}

function mergeDependencies(
  evaluation: ExpressionEvaluation,
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  return {
    ...evaluation,
    dependencies: uniqueEvaluatedDependencies([...dependencies, ...evaluation.dependencies]),
  };
}

function evaluateUnary(
  expression: Extract<ExpressionV1, { value: ExpressionV1 }>,
  scope: EvaluationScope
): ExpressionEvaluation {
  const value = evaluateNode(expression.value, scope);
  if (value.state !== 'value') return value;
  if (expression.op === 'not') {
    if (typeof value.value !== 'boolean')
      return errorEvaluation('invalid_value', value.dependencies);
    return { ...value, value: !value.value };
  }
  const result = negate(value.value);
  return result.state === 'value'
    ? { ...value, value: result.value }
    : errorEvaluation(result.code, value.dependencies);
}

function evaluateConditional(
  expression: Extract<ExpressionV1, { op: 'if' }>,
  scope: EvaluationScope
): ExpressionEvaluation {
  const condition = evaluateNode(expression.condition, scope);
  if (condition.state !== 'value') return condition;
  if (typeof condition.value !== 'boolean')
    return errorEvaluation('invalid_value', condition.dependencies);
  const branch = evaluateNode(
    condition.value ? expression.thenBranch : expression.elseBranch,
    scope
  );
  return mergeDependencies(branch, condition.dependencies);
}

function evaluateNode(expression: ExpressionV1, scope: EvaluationScope): ExpressionEvaluation {
  if (expression.op === 'literal')
    return { state: 'value', value: expression.value, dependencies: [] };
  if (expression.op === 'read') return evaluateRead(expression, scope.snapshot);
  if ('value' in expression) return evaluateUnary(expression, scope);
  if (expression.op === 'if') return evaluateConditional(expression, scope);
  if (expression.op === 'coalesce')
    return evaluateCoalesce(expression.values, scope.snapshot, (node) => evaluateNode(node, scope));
  return evaluateBinary(expression, scope);
}

/**
 * Evaluates a validated expression entirely against one synchronous item
 * snapshot. A version-2 measurement result is first converted into the
 * declared fixed unit; the result must then be canonical for the declared type.
 */
export function evaluateExpression(
  expression: ValidatedExpression,
  snapshot: ExpressionSnapshot
): ExpressionEvaluation {
  const dimensional = expression.version >= 2;
  const evaluated = evaluateNode(expression.ast, { snapshot, dimensional });
  if (evaluated.state !== 'value') return evaluated;
  const converted: ArithmeticResult = dimensional
    ? convertToFixedUnit(evaluated.value, expression.resultType.fixedUnit)
    : { state: 'value', value: evaluated.value };
  if (converted.state === 'error') return errorEvaluation(converted.code, evaluated.dependencies);
  const canonical = canonicalExpressionResult(converted.value, expression.resultType);
  return canonical === null
    ? errorEvaluation('invalid_value', evaluated.dependencies)
    : { ...evaluated, value: canonical };
}
