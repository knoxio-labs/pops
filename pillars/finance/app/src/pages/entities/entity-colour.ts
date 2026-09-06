/**
 * A soft background tint + a saturated foreground for an entity's assigned
 * `colour`, matching the tint/swatch pairing the design kit's `EntityAvatar`
 * uses for the same fallback (initials on the entity's colour, before
 * falling further back to plain initials). The palette itself is ten raw
 * hex values (`pillars/contacts/src/entities/colours.rs`) rather than the
 * design kit's OKLCH swatches, so the tint is derived by appending an alpha
 * channel to the hex instead of looking up a companion tint value.
 */
export function entityColourStyle(
  colour: string | null
): { backgroundColor: string; color: string } | undefined {
  if (!colour) return undefined;
  return { backgroundColor: `${colour}29`, color: colour };
}
