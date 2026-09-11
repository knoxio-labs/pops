/**
 * Whether a pillar's published page tree and the route table its app mounts
 * describe the same routes.
 *
 * A loader-mounted pillar declares its pages twice: `PageDescriptor[]` on the
 * wire, which the shell mounts, and a react-router `routes` table in its own
 * app. The two are kept by hand, and `satisfies Record<Slot, ComponentType>`
 * only pins the slot set, not the tree: a tab nested differently, a path
 * spelled differently or a slot bound to the wrong page compiles and passes
 * every slot test (POPS-3256).
 */
import type { PageDescriptor } from '../manifest-schema/index.js';

/**
 * One node of a react-router route table, as far as the comparison reads it.
 * Structural rather than react-router's own `RouteObject`, so this module needs
 * neither react-router nor React to load.
 */
export interface RouteTreeNode {
  readonly path?: string;
  readonly index?: boolean;
  readonly element?: unknown;
  readonly children?: readonly RouteTreeNode[];
}

function elementType(element: unknown): unknown {
  return typeof element === 'object' && element !== null && 'type' in element
    ? element.type
    : undefined;
}

function nodeMismatches(
  page: PageDescriptor,
  route: RouteTreeNode,
  components: Readonly<Record<string, unknown>>,
  where: string
): string[] {
  const problems: string[] = [];
  if ((page.index === true) !== (route.index === true)) {
    problems.push(
      `${where}: index is ${page.index === true} on the wire, ${route.index === true} in routes`
    );
  }
  if (page.path !== (route.path ?? '')) {
    problems.push(`${where}: path '${page.path}' on the wire, '${route.path ?? ''}' in routes`);
  }
  const component = components[page.bundleSlot];
  if (component === undefined || elementType(route.element) !== component) {
    problems.push(
      `${where}: slot '${page.bundleSlot}' does not render the component the route mounts`
    );
  }
  return [
    ...problems,
    ...pageTreeMismatches(page.children ?? [], route.children ?? [], components, where),
  ];
}

/**
 * Every place `pages` and `routes` disagree, compared node by node in order:
 * index flag, path, the component behind each slot against the route's
 * element, and the children beneath it. Empty when they describe the same
 * tree.
 *
 * @param components The app's slot-to-component map (`PAGE_COMPONENTS`).
 * @param at Location prefix for messages; callers leave it unset.
 */
export function pageTreeMismatches(
  pages: readonly PageDescriptor[],
  routes: readonly RouteTreeNode[],
  components: Readonly<Record<string, unknown>>,
  at = ''
): string[] {
  const problems: string[] = [];
  if (pages.length !== routes.length) {
    problems.push(
      `${at || '/'}: ${pages.length} page(s) on the wire, ${routes.length} route(s) mounted`
    );
  }
  for (let i = 0; i < Math.min(pages.length, routes.length); i += 1) {
    const page = pages[i];
    const route = routes[i];
    if (page === undefined || route === undefined) continue;
    problems.push(...nodeMismatches(page, route, components, `${at}/${page.path || '(index)'}`));
  }
  return problems;
}
