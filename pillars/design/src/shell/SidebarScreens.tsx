import { NavLink } from 'react-router';

import { cn } from '@pops/ui';

import { areasOf } from '../registry';
import { buildAddress } from './address';
import { useSurfaceCoords } from './use-surface-coords';

import type { Catalog, ExperimentEntry, ScreenEntry } from '../registry';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'block rounded-md px-3 py-2 text-sm leading-tight',
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  );

interface Node {
  screenId: string;
  title: string;
  screen?: ScreenEntry;
  experiments: ExperimentEntry[];
}

function splitId(screenId: string): { area: string; slug: string } {
  const [area = '', slug = ''] = screenId.split('/');
  return { area, slug };
}

/**
 * The tree: main screens under their area, each listing its active
 * experiments inline. An experiment whose screen exists only in its own
 * variants becomes a node of its own. Decided and archived experiments
 * render nowhere — they are history, and the overview lists them.
 */
function nodesByArea(catalog: Catalog): Map<string, Node[]> {
  const nodes: Node[] = catalog.screens.map((screen) => ({
    screenId: screen.id,
    title: screen.title,
    screen,
    experiments: screen.experiments.filter((e) => e.status === 'active'),
  }));
  const mainIds = new Set(catalog.screens.map((s) => s.id));
  for (const exp of catalog.experiments) {
    if (exp.status !== 'active' || mainIds.has(exp.screen)) continue;
    nodes.push({ screenId: exp.screen, title: splitId(exp.screen).slug, experiments: [exp] });
  }
  const byArea = new Map<string, Node[]>();
  for (const area of areasOf(catalog.screens)) byArea.set(area, []);
  for (const node of nodes) {
    const area = splitId(node.screenId).area;
    byArea.set(area, [...(byArea.get(area) ?? []), node]);
  }
  return byArea;
}

function FlowSteps({ base, steps }: { base: string; steps: ScreenEntry[] }) {
  return (
    <div className="mt-0.5 ml-3 border-l border-border pl-2">
      {steps.map((step) => (
        <NavLink key={step.id} to={`${base}/${step.id}`} className={linkClass}>
          {step.title}
        </NavLink>
      ))}
    </div>
  );
}

/** Main plus every variant of one experiment, each landing on the screen it explores. */
function VariantSwitch({
  exp,
  hasMain,
  activeVariantId,
}: {
  exp: ExperimentEntry;
  hasMain: boolean;
  activeVariantId: string | undefined;
}) {
  const coords = splitId(exp.screen);
  return (
    <div className="mt-1 ml-3 border-l border-border pl-2">
      <p className="px-3 py-1 text-xs font-medium" title={exp.question}>
        {exp.name}
      </p>
      {hasMain ? (
        <NavLink end to={buildAddress(coords)} className={linkClass}>
          Main
        </NavLink>
      ) : null}
      {exp.variants.map((variant) => {
        const base = buildAddress({ ...coords, experimentId: exp.id, variantId: variant.id });
        const realisation = variant.screens.find((s) => s.id === exp.screen);
        const active = activeVariantId === variant.id;
        return (
          <div key={variant.id}>
            <NavLink to={base} className={linkClass}>
              {variant.name}
            </NavLink>
            {active && realisation?.steps ? (
              <FlowSteps base={base} steps={realisation.steps} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ScreenNode({
  node,
  activeMainId,
  activeDesign,
}: {
  node: Node;
  activeMainId: string | undefined;
  activeDesign: { experimentId?: string; variantId?: string } | undefined;
}) {
  const base = buildAddress(splitId(node.screenId));
  return (
    <div>
      {node.screen ? (
        <NavLink end to={base} className={linkClass}>
          {node.title}
        </NavLink>
      ) : (
        <p className="px-3 py-2 text-sm text-muted-foreground italic">{node.title}</p>
      )}
      {node.screen?.steps && activeMainId === node.screenId ? (
        <FlowSteps base={base} steps={node.screen.steps} />
      ) : null}
      {node.experiments.map((exp) => (
        <VariantSwitch
          key={exp.id}
          exp={exp}
          hasMain={node.screen !== undefined}
          activeVariantId={
            activeDesign?.experimentId === exp.id ? activeDesign.variantId : undefined
          }
        />
      ))}
    </div>
  );
}

export function SidebarScreens({ catalog }: { catalog: Catalog }) {
  const coords = useSurfaceCoords();
  const activeMainId = coords && !coords.experimentId ? coords.screenId : undefined;
  const activeDesign = coords?.experimentId
    ? { experimentId: coords.experimentId, variantId: coords.variantId }
    : undefined;

  return (
    <nav aria-label="Screens" className="space-y-4">
      {[...nodesByArea(catalog)].map(([area, nodes]) => (
        <div key={area}>
          <p className="mb-1 px-3 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            {area}
          </p>
          {nodes.map((node) => (
            <ScreenNode
              key={node.screenId}
              node={node}
              activeMainId={activeMainId}
              activeDesign={activeDesign}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
