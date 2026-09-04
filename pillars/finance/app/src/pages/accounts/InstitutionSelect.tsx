import { EntitySelect } from '@pops/ui';

import type { Institution } from './types';

/** One HSL channel, converted to a two-digit hex byte. */
function hslChannelToHex(p: number, q: number, t: number): string {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  let channel = p;
  if (x < 1 / 6) channel = p + (q - p) * 6 * x;
  else if (x < 1 / 2) channel = q;
  else if (x < 2 / 3) channel = p + (q - p) * (2 / 3 - x) * 6;
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * Deterministic hex colour from an institution name, for the swatch
 * `institutionsCreate` requires (`colour` must match `/^#[0-9a-f]{6}$/i` —
 * `InstitutionSchema`) when this picker mints one inline. Not a design
 * choice worth a picker of its own (POPS-2803 is colour management, out of
 * scope here) — just enough that two different names rarely collide, hashed
 * to a hue and converted to hex since the wire schema takes nothing else.
 */
export function colourFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  const hue = (Math.abs(hash) % 360) / 360;
  const saturation = 0.55;
  const lightness = 0.45;
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const r = hslChannelToHex(p, q, hue + 1 / 3);
  const g = hslChannelToHex(p, q, hue);
  const b = hslChannelToHex(p, q, hue - 1 / 3);
  return `#${r}${g}${b}`;
}

/**
 * The account's issuing institution, backed by the real `institutions` REST
 * resource (`rest-institutions.ts`) — reuses `EntitySelect` rather than a
 * new picker, since an institution is exactly an `{ id, name }` a searchable
 * combobox already knows how to render, with inline create as its
 * `onCreate`.
 */
export function InstitutionSelect({
  institutions,
  value,
  onChange,
  onCreate,
}: {
  institutions: Institution[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        Institution
      </label>
      <EntitySelect
        entities={institutions}
        value={value ?? undefined}
        onChange={(id) => onChange(id)}
        onCreate={onCreate}
        onClear={() => onChange(null)}
        clearLabel="No institution"
        placeholder="No institution"
        searchPlaceholder="Search institutions..."
        emptyMessage="No institutions found."
        aria-label="Institution"
      />
    </div>
  );
}
