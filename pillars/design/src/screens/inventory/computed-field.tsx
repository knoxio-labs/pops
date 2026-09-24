import { computedScenarios } from '@/fixtures/inventory-computed-scenarios';
import { ComputedFieldEditor } from '@/kit/inventory/computed-editor/computed-field-editor';

import { Card, CardContent } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ComputedScenarioName } from '@/fixtures/inventory-computed-scenarios';

export const meta: ScreenMeta = { title: 'Computed field', order: 10, frame: 'web' };

/**
 * The web catalogue editor's computed-field authoring screen: expression
 * builder, override policy, single-item preview and every refusal, for
 * expression v1 plus `coalesce`, and expression v2's dimensional measurement
 * units (Inventory ADR-002 D5): derived products and quotients, dimension
 * conversion, and an unavailable preview naming every missing input.
 */
export function ComputedField({ state = 'loaded' }: { state?: ComputedScenarioName }) {
  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardContent className="p-4">
          <ComputedFieldEditor key={state} scenario={computedScenarios[state]} />
        </CardContent>
      </Card>
    </div>
  );
}

function stateNames(): readonly ComputedScenarioName[] {
  return Object.keys(computedScenarios).filter(
    (name): name is ComputedScenarioName => name in computedScenarios && name !== 'loaded'
  );
}

export const states: ScreenStates = Object.fromEntries(
  stateNames().map((name) => [name, () => <ComputedField state={name} />])
);

export default function ComputedFieldScreen() {
  return <ComputedField />;
}
