/**
 * CHART_CATEGORICAL_COLORS — CSS var references for the extended categorical
 * chart ramp, for SVG-rendered charts that need more series than the five
 * `--chart-*` tokens cover. `--chart-6`/`--chart-7` extend that ramp in
 * `globals.css`; entries 1-5 reuse the existing chart tokens.
 *
 * Sanctioned consumers (AGENTS.md "Styling" — canvas/chart JS colour
 * constants import from `@pops/ui/theme`, not hardcoded hex/hsl):
 * - `pillars/media/app/src/components/PreferenceProfile.tsx`
 */
export const CHART_CATEGORICAL_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
] as const;
