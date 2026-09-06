//! The fixed colour palette an entity's `colour` is assigned from.
//!
//! Mirrors `pillars/design/src/fixtures/entity-colors.ts`'s ten palette ids,
//! in the same order — that fixture owns the actual design tokens (the
//! swatch/tint/ring OKLCH triples a consuming app renders); this pillar only
//! needs the stable ids so it can assign and reroll among them. There is no
//! automated bridge between the TS fixture and this array, so a change to one
//! must be mirrored in the other by hand.
//!
//! `colour` is never a freeform value (POPS-3061 design correction): it is
//! assigned at random from this palette at creation time, server-side, and a
//! client may only "reroll" it to another palette entry — never set an
//! arbitrary string.
pub const ENTITY_COLOURS: [&str; 10] = [
    "rose", "amber", "lime", "emerald", "teal", "sky", "indigo", "violet", "fuchsia", "stone",
];

/// Pick a colour at random from the fixed palette.
pub fn random_colour() -> &'static str {
    ENTITY_COLOURS[random_index(ENTITY_COLOURS.len())]
}

/// Pick a colour at random from the fixed palette, excluding `current`.
///
/// A reroll that could return the same value it already had is a degenerate,
/// pointless reroll — so the pick happens among the palette entries other than
/// `current`. If `current` is not itself a palette entry (a legacy or
/// otherwise unexpected value), every entry is eligible.
pub fn random_other_colour(current: &str) -> &'static str {
    let candidates: Vec<&'static str> = ENTITY_COLOURS
        .into_iter()
        .filter(|colour| *colour != current)
        .collect();
    candidates[random_index(candidates.len())]
}

/// A random index in `0..len`, drawn from a v4 UUID's random bits so the
/// crate needs no extra RNG dependency. `len` must be non-zero — true for
/// every caller here, since the palette has ten entries and
/// `random_other_colour` never filters it down to zero (excluding at most one
/// of ten always leaves nine).
fn random_index(len: usize) -> usize {
    let bytes = uuid::Uuid::new_v4().into_bytes();
    let value = u64::from_le_bytes(
        bytes[0..8]
            .try_into()
            .expect("8-byte slice from a 16-byte uuid"),
    );
    (value % len as u64) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_colour_is_always_a_palette_entry() {
        for _ in 0..200 {
            assert!(ENTITY_COLOURS.contains(&random_colour()));
        }
    }

    #[test]
    fn random_other_colour_never_repeats_the_current_value() {
        for current in ENTITY_COLOURS {
            for _ in 0..50 {
                let next = random_other_colour(current);
                assert_ne!(next, current);
                assert!(ENTITY_COLOURS.contains(&next));
            }
        }
    }

    #[test]
    fn random_other_colour_is_eligible_for_every_entry_when_current_is_unrecognized() {
        let next = random_other_colour("not-a-palette-id");
        assert!(ENTITY_COLOURS.contains(&next));
    }
}
