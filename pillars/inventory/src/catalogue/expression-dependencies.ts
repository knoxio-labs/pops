import { ExpressionValidationError } from './expression-types.js';

import type {
  ExpressionDependency,
  ExpressionFieldKey,
  ValidatedExpression,
} from './expression-types.js';

/** Encodes a stable catalogue field identity for graph and cache indexes. */
export function expressionFieldKey(field: ExpressionFieldKey): string {
  return `${field.typeId}:${field.fieldId}`;
}

/**
 * Builds the declared type/field dependency graph for computed definitions.
 * `withinItems` leaves out reads through the assembly relation: those always
 * move up an acyclic chain of items, so they cannot cycle at runtime even when
 * a definition reads itself, and the cycle check uses that graph.
 */
export function buildExpressionDependencyGraph(
  expressions: readonly ValidatedExpression[],
  { withinItems = false }: { readonly withinItems?: boolean } = {}
): ReadonlyMap<string, ReadonlySet<string>> {
  const graph = new Map<string, ReadonlySet<string>>();
  for (const expression of expressions) {
    const dependencies = withinItems
      ? expression.dependencies.filter((dependency) => !dependency.throughAssembly)
      : expression.dependencies;
    graph.set(expressionFieldKey(expression.field), new Set(dependencies.map(expressionFieldKey)));
  }
  return graph;
}

function visit(
  node: string,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  active: string[],
  complete: Set<string>
): void {
  const cycleStart = active.indexOf(node);
  if (cycleStart !== -1) {
    const cycle = [...active.slice(cycleStart), node];
    throw new ExpressionValidationError(
      'expression_cycle',
      'expression',
      `computed dependency cycle: ${cycle.join(' -> ')}`
    );
  }
  if (complete.has(node)) return;
  active.push(node);
  for (const dependency of graph.get(node) ?? []) {
    if (graph.has(dependency)) visit(dependency, graph, active, complete);
  }
  active.pop();
  complete.add(node);
}

/** Rejects direct and transitive cycles in a computed-field dependency graph. */
export function assertAcyclicExpressionGraph(
  graph: ReadonlyMap<string, ReadonlySet<string>>
): void {
  const complete = new Set<string>();
  for (const node of graph.keys()) visit(node, graph, [], complete);
}

/** Returns every computed definition transitively invalidated by changed fields. */
export function collectInvalidatedExpressions(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  changed: readonly ExpressionFieldKey[]
): ReadonlySet<string> {
  const reverse = new Map<string, Set<string>>();
  for (const [dependent, dependencies] of graph) {
    for (const dependency of dependencies) {
      const dependents = reverse.get(dependency) ?? new Set<string>();
      dependents.add(dependent);
      reverse.set(dependency, dependents);
    }
  }
  const invalidated = new Set<string>();
  const pending = changed.map(expressionFieldKey);
  while (pending.length > 0) {
    const dependency = pending.shift();
    if (dependency === undefined) break;
    for (const dependent of reverse.get(dependency) ?? []) {
      if (invalidated.has(dependent)) continue;
      invalidated.add(dependent);
      pending.push(dependent);
    }
  }
  return invalidated;
}

/**
 * Removes duplicate static dependencies while retaining deterministic order.
 * A field read both on the item and on its assembly is kept once for each.
 */
export function uniqueExpressionDependencies(
  dependencies: readonly ExpressionDependency[]
): readonly ExpressionDependency[] {
  const unique = new Map<string, ExpressionDependency>();
  const key = (dependency: ExpressionDependency): string =>
    `${expressionFieldKey(dependency)}:${dependency.throughAssembly ? 'assembly' : 'item'}`;
  for (const dependency of dependencies.toSorted((left, right) =>
    left.via.join('/').localeCompare(right.via.join('/'))
  ))
    if (!unique.has(key(dependency))) unique.set(key(dependency), dependency);
  return [...unique.values()].toSorted((left, right) => {
    return expressionFieldKey(left).localeCompare(expressionFieldKey(right));
  });
}
