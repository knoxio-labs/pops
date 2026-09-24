import type { ExpressionNode } from './model.js';

/** One input of a node: the slot's author-facing name and its path segment. */
export interface NodeChild {
  readonly slot: string;
  readonly segment: string;
  readonly node: ExpressionNode;
}

/** A node placed in the outline, addressed by the server's issue path grammar. */
export interface OutlineRow {
  readonly path: string;
  readonly depth: number;
  readonly slot: string | null;
  readonly node: ExpressionNode;
}

/** The root path every server expression issue is reported under. */
export const ROOT_PATH = 'expression';

/**
 * The inputs of a node in evaluation order. Segments match the server's
 * validation paths (`left`, `then`, `values.0`), so an issue returned for
 * `expression.left.right` lands on the node the author sees.
 */
export function nodeChildren(node: ExpressionNode): readonly NodeChild[] {
  switch (node.op) {
    case 'empty':
    case 'literal':
    case 'read':
      return [];
    case 'negate':
    case 'not':
      return [{ slot: 'Value', segment: 'value', node: node.value }];
    case 'if':
      return [
        { slot: 'Condition', segment: 'condition', node: node.condition },
        { slot: 'Then', segment: 'then', node: node.thenBranch },
        { slot: 'Otherwise', segment: 'else', node: node.elseBranch },
      ];
    case 'coalesce':
      return node.values.map((value, index) => ({
        slot: `Input ${index + 1}`,
        segment: `values.${index}`,
        node: value,
      }));
    default:
      return [
        { slot: 'Left', segment: 'left', node: node.left },
        { slot: 'Right', segment: 'right', node: node.right },
      ];
  }
}

/** Flattens a tree into outline rows, depth first, parents before children. */
export function outlineRows(
  node: ExpressionNode,
  path = ROOT_PATH,
  depth = 0,
  slot: string | null = null
): readonly OutlineRow[] {
  return [
    { path, depth, slot, node },
    ...nodeChildren(node).flatMap((child) =>
      outlineRows(child.node, `${path}.${child.segment}`, depth + 1, child.slot)
    ),
  ];
}

/** The path of a node's parent; the root is its own parent. */
export function parentPath(path: string): string {
  const withoutIndex = path.replace(/\.values\.\d+$/u, '');
  if (withoutIndex !== path) return withoutIndex;
  const cut = path.lastIndexOf('.');
  return cut === -1 ? path : path.slice(0, cut);
}

/** The node at an issue path, or undefined when the path names none. */
export function nodeAt(root: ExpressionNode, path: string): ExpressionNode | undefined {
  return outlineRows(root).find((row) => row.path === path)?.node;
}

/**
 * Whether a server issue path belongs to the node at `nodePath`. A read's own
 * parts (`.fieldId`, `.path`, `.path.0`) and a node's `.op` are not nodes, so
 * their issues land on the node that owns them.
 */
export function issueBelongsTo(issuePath: string, nodePath: string): boolean {
  return (
    issuePath === nodePath ||
    issuePath === `${nodePath}.fieldId` ||
    issuePath === `${nodePath}.op` ||
    issuePath === `${nodePath}.path` ||
    issuePath.startsWith(`${nodePath}.path.`)
  );
}

/**
 * The outline row a server issue path lands on: the deepest node that owns
 * it, or the root when the path names no node (a field-level or cycle issue).
 */
export function issueNodePath(root: ExpressionNode, issuePath: string): string {
  const rows = outlineRows(root);
  const owner = rows.findLast((row) => issueBelongsTo(issuePath, row.path));
  return owner?.path ?? ROOT_PATH;
}

/** Counts of what the draft contains, measured against the server's bounds. */
export interface ExpressionStats {
  readonly nodes: number;
  readonly emptySlots: number;
  readonly deepestHops: number;
}

/** Counts placed nodes and empty slots and finds the longest read path. */
export function expressionStats(root: ExpressionNode): ExpressionStats {
  const rows = outlineRows(root);
  const emptySlots = rows.filter((row) => row.node.op === 'empty').length;
  const deepestHops = Math.max(
    0,
    ...rows.map((row) => (row.node.op === 'read' ? row.node.path.length : 0))
  );
  return { nodes: rows.length - emptySlots, emptySlots, deepestHops };
}
