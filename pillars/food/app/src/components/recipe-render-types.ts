/**
 * View types consumed by `RecipeRenderer`.
 *
 * Every joined-row shape is projected from the generated food SDK's
 * `recipesGetForRendering` response so the renderer stays in lockstep with
 * the REST wire surface. `ResolvedStepBody` is the FE-side parse of each
 * step's `bodyResolvedJson` blob — the wire ships it as an opaque string,
 * so the structured shape lives here (it mirrors the compiler's emitted
 * JSON). FE-only ergonomics (`RecipeRendererProps`, `RecipeRendererVariant`)
 * round out the set.
 */
import type { QtyUnit } from '@pops/food/dsl';

import type { RecipesGetForRenderingResponses } from '../food-api/types.gen.js';

type RenderPayload = RecipesGetForRenderingResponses[200];

/**
 * The wire schema declares `temperatureUnit` as a nullable enum
 * (`rest-recipe-render-schemas.ts`), but OpenAPI 3.0 expresses that as
 * `nullable: true` alongside `enum`, and the codegen drops the null —
 * so the generated type claims a unit is always present. A step without a
 * temperature ships `null`, which is why `RecipeStepList` guards on it.
 */
export type RecipeStepRow = Omit<RenderPayload['steps'][number], 'temperatureUnit'> & {
  temperatureUnit: RenderPayload['steps'][number]['temperatureUnit'] | null;
};

export type RecipeVersionWithCompiledData = Omit<RenderPayload, 'steps'> & {
  steps: RecipeStepRow[];
};
export type RecipeLineWithResolved = RenderPayload['lines'][number];
export type RecipeVersionRow = RenderPayload['version'];
export type RecipeRow = RenderPayload['recipe'];
export type IngredientRow = NonNullable<RenderPayload['yieldIngredient']>;
export type IngredientVariantRow = NonNullable<RenderPayload['yieldVariant']>;
export type PrepStateRow = NonNullable<RenderPayload['yieldPrepState']>;

/**
 * Parsed shape of a step's `bodyResolvedJson`: ordered text segments plus
 * structural `ref` / `time` / `temperature` parts carrying ingredient ids,
 * duration values, and temperature units.
 */
export type ResolvedStepBody = ResolvedStepBodyPart[];

export type ResolvedStepBodyPart =
  | { kind: 'text'; value: string }
  | {
      kind: 'ref';
      ingredientIndex: number | null;
      ingredientId: number | null;
      variantId: number | null;
      prepStateId: number | null;
    }
  | { kind: 'time'; qty: QtyUnit }
  | { kind: 'temperature'; qty: QtyUnit };

export type RecipeRendererVariant = 'detail' | 'compact';

export interface RecipeRendererProps {
  recipeVersion: RecipeVersionWithCompiledData;
  /** Display-only multiplier on quantities. Defaults to 1.0. */
  scaleFactor?: number;
  /**
   * Fire-and-forget — `RecipeRenderer` does not track running timers, so
   * the parent owns timer state.
   */
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void;
  /** `'detail'` is the full page; `'compact'` is the list-card preview. */
  variant?: RecipeRendererVariant;
  className?: string;
}
