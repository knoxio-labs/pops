/**
 * Pure tree/clustering data transforms for `SidebarScreens.tsx` — split out
 * to keep that file's rendering under the repo's line cap.
 */
import { pathOf } from './address';

import type {
  Catalog,
  ExperimentEntry,
  GroupNode,
  Placed,
  ScreenEntry,
  TreeNode,
} from '../registry';

/** A screen's place in the tree: the main screen if there is one, its active experiments, or both. */
export interface Node extends Placed {
  id: string;
  order: number;
  title: string;
  screen?: ScreenEntry;
  experiments: ExperimentEntry[];
}

/** "account-form" → "Account form" — a group folder has no file to carry a title. */
export function prettify(name: string): string {
  const spaced = name.replace(/-/gu, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface Cluster {
  key: string;
  grouped: boolean;
  nodes: Node[];
}

/** "Accounts" and "Account" are the same leading word for grouping purposes. */
function leadingWordKey(title: string): string {
  const word = (title.split(' ')[0] ?? '').toLowerCase();
  return word.length > 1 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * Screens whose title shares a leading word — "Import", "Import review",
 * "Import warnings"; "Accounts", "Account form", "Account picker" — belong to
 * the same corner of the app and read as one long flat list otherwise. The
 * grouping is the title itself, not a taxonomy layered on top of it: nothing
 * is reclassified, a shared first word just keeps its screens visually
 * together and gives them a shared band. A word only one screen uses (an
 * area's odd one out, like "Transaction form" on its own) stays ungrouped —
 * a cluster of one is not a cluster.
 */
function clusterNodes(nodes: Node[]): Cluster[] {
  const order: string[] = [];
  const byKey = new Map<string, Node[]>();
  for (const node of nodes) {
    const key = leadingWordKey(node.title);
    const existing = byKey.get(key);
    if (existing) existing.push(node);
    else {
      byKey.set(key, [node]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const members = byKey.get(key) ?? [];
    return { key, grouped: members.length > 1, nodes: members };
  });
}

/**
 * The tree: main screens under their area and whatever groups nest them, each
 * listing its active experiments inline. An experiment whose screen exists
 * only in its own variants becomes a node of its own, in the place its id
 * puts it. Decided and archived experiments render nowhere — they are
 * history, and the overview lists them.
 */
export function nodesOf(catalog: Catalog): Node[] {
  const nodes: Node[] = catalog.screens.map((screen) => ({
    id: screen.id,
    order: screen.order,
    title: screen.title,
    screen,
    experiments: screen.experiments.filter((e) => e.status === 'active'),
  }));
  const mainIds = new Set(catalog.screens.map((s) => s.id));
  for (const exp of catalog.experiments) {
    if (exp.status !== 'active' || mainIds.has(exp.screen)) continue;
    nodes.push({
      id: exp.screen,
      order: Number.MAX_SAFE_INTEGER,
      title: prettify(pathOf(exp.screen).at(-1) ?? exp.screen),
      experiments: [exp],
    });
  }
  return nodes;
}

export type Segment =
  | { kind: 'group'; group: GroupNode<Node> }
  | { kind: 'cluster'; cluster: Cluster };

/** Groups break a run of clustered items — a group already carries its own
 *  label, so it never joins a cluster and never gets clustered against. */
export function toSegments(nodes: TreeNode<Node>[]): Segment[] {
  const segments: Segment[] = [];
  let pending: Node[] = [];
  const flush = (): void => {
    for (const cluster of clusterNodes(pending)) segments.push({ kind: 'cluster', cluster });
    pending = [];
  };
  for (const node of nodes) {
    if (node.kind === 'group') {
      flush();
      segments.push({ kind: 'group', group: node.group });
    } else {
      pending.push(node.item);
    }
  }
  flush();
  return segments;
}
