/**
 * This app's navigation declaration: what the rail shows for it and which
 * pages its page nav lists.
 *
 * Its own module rather than part of `routes.tsx` so that reading the nav
 * does not pull the route table's lazy page imports in with it — the design
 * playground draws the POPS chrome from these configs and has no use for
 * every page of every app.
 */
import type { IconName } from '@pops/navigation';

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  labelKey: string;
  icon: IconName;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: { path: string; label: string; labelKey: string; icon: IconName }[];
}

export const navConfig = {
  id: 'cerebrum',
  label: 'Cerebrum',
  labelKey: 'cerebrum',
  icon: 'BookOpen',
  color: 'sky',
  basePath: '/cerebrum',
  items: [
    { path: '', label: 'Ingest', labelKey: 'cerebrum.ingest', icon: 'FileText' },
    { path: '/engrams', label: 'Engrams', labelKey: 'cerebrum.engrams.nav', icon: 'Library' },
    { path: '/query', label: 'Query', labelKey: 'cerebrum.query.nav', icon: 'Search' },
    {
      path: '/documents',
      label: 'Documents',
      labelKey: 'cerebrum.documents.nav',
      icon: 'FileText',
    },
    { path: '/nudges', label: 'Nudges', labelKey: 'cerebrum.nudges', icon: 'Bell' },
    {
      path: '/proposals',
      label: 'Proposals',
      labelKey: 'cerebrum.proposals',
      icon: 'GitPullRequest',
    },
    { path: '/glia', label: 'Glia', labelKey: 'cerebrum.glia.nav', icon: 'Activity' },
    { path: '/reflex', label: 'Reflex', labelKey: 'cerebrum.reflex.nav', icon: 'Zap' },
    { path: '/plexus', label: 'Plexus', labelKey: 'cerebrum.plexus.nav', icon: 'Plug' },
  ],
} satisfies AppNavConfigShape;
