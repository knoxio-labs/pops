import { PlannerCanvas } from './canvas';

import type { PlannerScenario } from './model';

/** Direct route planning with shared source records across date-range and timeline projections. */
export function DirectPlanner({ scenario = 'default' }: { scenario?: PlannerScenario }) {
  return <PlannerCanvas scenario={scenario} />;
}
