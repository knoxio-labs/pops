/**
 * The preselected palette an entity's `colour` is assigned from at creation
 * (POPS-2805). Unlike `hashToColor` — deterministic per string, unbounded hue
 * — this is a small fixed set: assignment is random-at-creation, not derived,
 * so the same ten swatches have to read well on every entity that gets one.
 */
export interface EntityColor {
  id: string;
  label: string;
  swatch: string;
  tint: string;
  ring: string;
}

export const ENTITY_COLORS: EntityColor[] = [
  {
    id: 'rose',
    label: 'Rose',
    swatch: 'oklch(0.62 0.19 12)',
    tint: 'oklch(0.62 0.19 12 / 0.16)',
    ring: 'oklch(0.62 0.19 12 / 0.4)',
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: 'oklch(0.75 0.15 75)',
    tint: 'oklch(0.75 0.15 75 / 0.16)',
    ring: 'oklch(0.75 0.15 75 / 0.4)',
  },
  {
    id: 'lime',
    label: 'Lime',
    swatch: 'oklch(0.72 0.18 128)',
    tint: 'oklch(0.72 0.18 128 / 0.16)',
    ring: 'oklch(0.72 0.18 128 / 0.4)',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: 'oklch(0.6 0.15 155)',
    tint: 'oklch(0.6 0.15 155 / 0.16)',
    ring: 'oklch(0.6 0.15 155 / 0.4)',
  },
  {
    id: 'teal',
    label: 'Teal',
    swatch: 'oklch(0.62 0.11 190)',
    tint: 'oklch(0.62 0.11 190 / 0.16)',
    ring: 'oklch(0.62 0.11 190 / 0.4)',
  },
  {
    id: 'sky',
    label: 'Sky',
    swatch: 'oklch(0.65 0.14 235)',
    tint: 'oklch(0.65 0.14 235 / 0.16)',
    ring: 'oklch(0.65 0.14 235 / 0.4)',
  },
  {
    id: 'indigo',
    label: 'Indigo',
    swatch: 'oklch(0.55 0.17 270)',
    tint: 'oklch(0.55 0.17 270 / 0.16)',
    ring: 'oklch(0.55 0.17 270 / 0.4)',
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: 'oklch(0.58 0.19 300)',
    tint: 'oklch(0.58 0.19 300 / 0.16)',
    ring: 'oklch(0.58 0.19 300 / 0.4)',
  },
  {
    id: 'fuchsia',
    label: 'Fuchsia',
    swatch: 'oklch(0.62 0.22 330)',
    tint: 'oklch(0.62 0.22 330 / 0.16)',
    ring: 'oklch(0.62 0.22 330 / 0.4)',
  },
  {
    id: 'stone',
    label: 'Stone',
    swatch: 'oklch(0.55 0.01 90)',
    tint: 'oklch(0.55 0.01 90 / 0.16)',
    ring: 'oklch(0.55 0.01 90 / 0.4)',
  },
];

export const entityColorById = new Map(ENTITY_COLORS.map((c) => [c.id, c]));
