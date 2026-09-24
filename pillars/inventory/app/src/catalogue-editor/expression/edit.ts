import { ROOT_PATH } from '@pops/inventory/expression';

import type { BinaryOp, ExpressionNode, NodeOp } from '@pops/inventory/expression';

/** The editor-only placeholder for a slot nothing fills yet. */
export const EMPTY: ExpressionNode = { op: 'empty' };

/** Operations that wrap an existing node rather than fill a slot on their own. */
export type WrappingOp = Exclude<NodeOp, 'empty' | 'literal' | 'read'>;

type Update = (child: ExpressionNode) => ExpressionNode;

function mapConditional(
  node: Extract<ExpressionNode, { op: 'if' }>,
  segment: string,
  update: Update
): ExpressionNode {
  if (segment === 'condition') return { ...node, condition: update(node.condition) };
  if (segment === 'then') return { ...node, thenBranch: update(node.thenBranch) };
  return segment === 'else' ? { ...node, elseBranch: update(node.elseBranch) } : node;
}

function mapCoalesce(
  node: Extract<ExpressionNode, { op: 'coalesce' }>,
  segment: string,
  update: Update
): ExpressionNode {
  const index = Number(/^values\.(\d+)$/u.exec(segment)?.[1] ?? Number.NaN);
  return {
    ...node,
    values: node.values.map((value, at) => (at === index ? update(value) : value)),
  };
}

function mapChild(node: ExpressionNode, segment: string, update: Update): ExpressionNode {
  switch (node.op) {
    case 'negate':
    case 'not':
      return segment === 'value' ? { ...node, value: update(node.value) } : node;
    case 'if':
      return mapConditional(node, segment, update);
    case 'coalesce':
      return mapCoalesce(node, segment, update);
    case 'empty':
    case 'literal':
    case 'read':
      return node;
    default:
      if (segment === 'left') return { ...node, left: update(node.left) };
      return segment === 'right' ? { ...node, right: update(node.right) } : node;
  }
}

function segments(path: string): readonly string[] {
  if (path === ROOT_PATH) return [];
  const rest = path.slice(ROOT_PATH.length + 1).split('.');
  const joined: string[] = [];
  for (const part of rest) {
    const last = joined.at(-1);
    if (last === 'values' && /^\d+$/u.test(part)) joined[joined.length - 1] = `values.${part}`;
    else joined.push(part);
  }
  return joined;
}

/** Applies `update` to the node at `path`, returning a new tree; unknown paths change nothing. */
export function updateAt(
  root: ExpressionNode,
  path: string,
  update: (node: ExpressionNode) => ExpressionNode
): ExpressionNode {
  const walk = (node: ExpressionNode, rest: readonly string[]): ExpressionNode => {
    const [head, ...tail] = rest;
    if (head === undefined) return update(node);
    return mapChild(node, head, (child) => walk(child, tail));
  };
  return walk(root, segments(path));
}

/** Puts `node` in the slot at `path`, discarding what was there. */
export function replaceAt(
  root: ExpressionNode,
  path: string,
  node: ExpressionNode
): ExpressionNode {
  return updateAt(root, path, () => node);
}

/** Empties the slot at `path`; at the root this clears the whole expression. */
export function clearAt(root: ExpressionNode, path: string): ExpressionNode {
  return replaceAt(root, path, EMPTY);
}

/** A fresh node for `op` whose inputs are all empty slots. */
export function operationNode(op: WrappingOp): ExpressionNode {
  switch (op) {
    case 'negate':
    case 'not':
      return { op, value: EMPTY };
    case 'if':
      return { op, condition: EMPTY, thenBranch: EMPTY, elseBranch: EMPTY };
    case 'coalesce':
      return { op, values: [EMPTY, EMPTY] };
    default:
      return { op, left: EMPTY, right: EMPTY };
  }
}

/**
 * Wraps the node at `path` in `op`. The wrapped node becomes the first input,
 * or `Then` of an `if`, so the author only fills what is new.
 */
export function wrapAt(root: ExpressionNode, path: string, op: WrappingOp): ExpressionNode {
  return updateAt(root, path, (node) => {
    switch (op) {
      case 'negate':
      case 'not':
        return { op, value: node };
      case 'if':
        return { op, condition: EMPTY, thenBranch: node, elseBranch: EMPTY };
      case 'coalesce':
        return { op, values: [node, EMPTY] };
      default:
        return { op, left: node, right: EMPTY };
    }
  });
}

/** Swaps a two-input operation for another, keeping both inputs. */
export function switchBinaryOp(root: ExpressionNode, path: string, op: BinaryOp): ExpressionNode {
  return updateAt(root, path, (node) => ('left' in node ? { ...node, op } : node));
}

function updateValues(
  root: ExpressionNode,
  path: string,
  update: (values: readonly ExpressionNode[]) => readonly ExpressionNode[]
): ExpressionNode {
  return updateAt(root, path, (node) =>
    node.op === 'coalesce' ? { ...node, values: update(node.values) } : node
  );
}

/** Appends an empty input to the `coalesce` at `path`. */
export function addCoalesceInput(root: ExpressionNode, path: string): ExpressionNode {
  return updateValues(root, path, (values) => [...values, EMPTY]);
}

/** Removes one input of the `coalesce` at `path`, never below the two it needs. */
export function removeCoalesceInput(
  root: ExpressionNode,
  path: string,
  index: number
): ExpressionNode {
  return updateValues(root, path, (values) =>
    values.length <= 2 ? values : values.filter((_, at) => at !== index)
  );
}

/** Moves one input of the `coalesce` at `path` by `delta` places, within bounds. */
export function moveCoalesceInput(
  root: ExpressionNode,
  path: string,
  index: number,
  delta: -1 | 1
): ExpressionNode {
  return updateValues(root, path, (values) => {
    const target = index + delta;
    const moving = values[index];
    const other = values[target];
    if (moving === undefined || other === undefined) return values;
    return values.map((value, at) => {
      if (at === index) return other;
      return at === target ? moving : value;
    });
  });
}
