import { computedScenarios } from '@/fixtures/inventory-computed-scenarios';
import { ComputedFieldEditor } from '@/kit/inventory/computed-editor/computed-field-editor';

type ExpressionError = 'dependency' | 'cycle';

function scenarioFor(error: ExpressionError | undefined) {
  if (error === 'dependency') return computedScenarios['field-not-on-every-target'];
  if (error === 'cycle') return computedScenarios.cycle;
  return computedScenarios.loaded;
}

/**
 * The type editor's Computation tab: the computed-field editor embedded
 * without its own field header, in its loaded, unknown-field and cycle states.
 */
export function ComputedEditor({ error }: { error?: ExpressionError }) {
  return <ComputedFieldEditor scenario={scenarioFor(error)} embedded />;
}
