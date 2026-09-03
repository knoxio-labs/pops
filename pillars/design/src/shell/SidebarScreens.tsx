import { Link, NavLink } from 'react-router';

import { cn } from '@pops/ui';

import { buildScreenTree } from '../registry';
import { buildAddress, pathOf, type Address } from './address';
import { useSurfaceCoords } from './use-surface-coords';

import type { ReactNode } from 'react';

import type {
  Catalog,
  ExperimentEntry,
  GroupNode,
  Placed,
  ScreenEntry,
  TreeNode,
} from '../registry';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'block rounded-md px-3 py-2 text-sm leading-tight',
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  );

/** A screen's place in the tree: the main screen if there is one, its active experiments, or both. */
interface Node extends Placed {
  id: string;
  order: number;
  title: string;
  screen?: ScreenEntry;
  experiments: ExperimentEntry[];
}

/** "account-form" → "Account form" — a group folder has no file to carry a title. */
function prettify(name: string): string {
  const spaced = name.replace(/-/gu, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Cluster {
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
function nodesOf(catalog: Catalog): Node[] {
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

/** Every nested level indents inside the same rule, so depth reads at a glance. */
function Nested({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 ml-3 border-l border-border pl-2">{children}</div>;
}

/**
 * Steps of one flow. Every step shares the flow's path and differs only in
 * `?step=`, which `NavLink` does not look at — so which one is current is
 * passed in rather than left to the router, or they would all light up.
 */
function FlowSteps({
  address,
  steps,
  activeStepId,
}: {
  address: Address;
  steps: ScreenEntry[];
  activeStepId: string | undefined;
}) {
  return (
    <Nested>
      {steps.map((step) => (
        <Link
          key={step.id}
          to={buildAddress({ ...address, stepId: step.slug })}
          className={linkClass({ isActive: step.slug === activeStepId })}
        >
          {step.title}
        </Link>
      ))}
    </Nested>
  );
}

/** Main plus every variant of one experiment, each landing on the screen it explores. */
function VariantSwitch({
  exp,
  hasMain,
  activeVariantId,
  activeStepId,
}: {
  exp: ExperimentEntry;
  hasMain: boolean;
  activeVariantId: string | undefined;
  activeStepId: string | undefined;
}) {
  const path = pathOf(exp.screen);
  return (
    <Nested>
      <p className="px-3 py-1 text-xs font-medium" title={exp.question}>
        {exp.name}
      </p>
      {hasMain ? (
        <NavLink end to={buildAddress({ path })} className={linkClass}>
          Main
        </NavLink>
      ) : null}
      {exp.variants.map((variant) => {
        const address = { path, experimentId: exp.id, variantId: variant.id };
        const realisation = variant.screens.find((s) => s.id === exp.screen);
        const active = activeVariantId === variant.id;
        return (
          <div key={variant.id}>
            <NavLink to={buildAddress(address)} className={linkClass}>
              {variant.name}
            </NavLink>
            {active && realisation?.steps ? (
              <FlowSteps address={address} steps={realisation.steps} activeStepId={activeStepId} />
            ) : null}
          </div>
        );
      })}
    </Nested>
  );
}

interface Active {
  mainId: string | undefined;
  stepId: string | undefined;
  design: { experimentId?: string; variantId?: string } | undefined;
}

function ScreenNode({ node, active }: { node: Node; active: Active }) {
  const address: Address = { path: pathOf(node.id) };
  return (
    <div>
      {node.screen ? (
        <NavLink end to={buildAddress(address)} className={linkClass}>
          {node.title}
        </NavLink>
      ) : (
        <p className="px-3 py-2 text-sm text-muted-foreground italic">{node.title}</p>
      )}
      {node.screen?.steps && active.mainId === node.id ? (
        <FlowSteps address={address} steps={node.screen.steps} activeStepId={active.stepId} />
      ) : null}
      {node.experiments.map((exp) => (
        <VariantSwitch
          key={exp.id}
          exp={exp}
          hasMain={node.screen !== undefined}
          activeVariantId={
            active.design?.experimentId === exp.id ? active.design.variantId : undefined
          }
          activeStepId={active.stepId}
        />
      ))}
    </div>
  );
}

type Segment =
  | { kind: 'group'; group: GroupNode<Node> }
  | { kind: 'cluster'; cluster: Cluster };

/** Groups break a run of clustered items — a group already carries its own
 *  label, so it never joins a cluster and never gets clustered against. */
function toSegments(nodes: TreeNode<Node>[]): Segment[] {
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

function Branch({ nodes, active }: { nodes: TreeNode<Node>[]; active: Active }) {
  return (
    <>
      {toSegments(nodes).map((segment) =>
        segment.kind === 'group' ? (
          <Group key={segment.group.path.join('/')} group={segment.group} active={active} />
        ) : (
          <div
            key={segment.cluster.key}
            className={segment.cluster.grouped ? 'rounded-lg bg-muted/40 py-1' : undefined}
          >
            {segment.cluster.nodes.map((node) => (
              <ScreenNode key={node.id} node={node} active={active} />
            ))}
          </div>
        )
      )}
    </>
  );
}

/** A group below the area: its name, then everything under it, indented. */
function Group({ group, active }: { group: GroupNode<Node>; active: Active }) {
  return (
    <div className="mt-1">
      <p className="px-3 py-1 text-xs font-medium text-foreground">{prettify(group.name)}</p>
      <Nested>
        <Branch nodes={group.children} active={active} />
      </Nested>
    </div>
  );
}

export function SidebarScreens({ catalog }: { catalog: Catalog }) {
  const coords = useSurfaceCoords();
  const active: Active = {
    mainId: coords && !coords.experimentId ? coords.screenId : undefined,
    stepId: coords?.stepId,
    design: coords?.experimentId
      ? { experimentId: coords.experimentId, variantId: coords.variantId }
      : undefined,
  };

  return (
    <nav aria-label="Screens" className="space-y-4">
      {buildScreenTree(nodesOf(catalog)).map((area) => (
        <div key={area.name} className="space-y-1.5">
          <p className="px-3 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            {area.name}
          </p>
          <Branch nodes={area.children} active={active} />
        </div>
      ))}
    </nav>
  );
}
