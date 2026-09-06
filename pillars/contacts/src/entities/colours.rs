//! The fixed colour palette an entity's `colour` is assigned from.
//!
//! Mirrors `pillars/design/src/fixtures/entity-colors.ts`'s ten palette
//! entries, in the same order — that fixture owns the actual design tokens
//! (the swatch/tint/ring OKLCH triples a consuming app renders). The backend
//! stores and serves the *hex* equivalent of each entry's `swatch` OKLCH
//! value, not the fixture's `id`, so `colour` is a value any consumer can
//! render directly without also shipping the OKLCH-keyed palette — the same
//! `#rrggbb` shape finance's `colourFromName` already produces for
//! institutions. Each hex value below was computed from the fixture's
//! `swatch` via the standard OKLab/OKLCH → linear-sRGB → sRGB conversion
//! (Björn Ottosson's published matrices, the same ones behind the CSS Color
//! 4 spec); the comment on each entry names the fixture id and OKLCH triple
//! it was derived from. There is no automated bridge between the TS fixture
//! and this array, so a change to one must be mirrored in the other by hand.
//!
//! `colour` is never a freeform value (POPS-3061 design correction): it is
//! assigned at random from this palette at creation time, server-side, and a
//! client may only "reroll" it to another palette entry — never set an
//! arbitrary string.
pub const ENTITY_COLOURS: [&str; 10] = [
    "#e04667", // rose:    oklch(0.62 0.19 12)
    "#e49e22", // amber:   oklch(0.75 0.15 75)
    "#83b81d", // lime:    oklch(0.72 0.18 128)
    "#009956", // emerald: oklch(0.6 0.15 155)
    "#009b95", // teal:    oklch(0.62 0.11 190)
    "#009bd8", // sky:     oklch(0.65 0.14 235)
    "#4c66d3", // indigo:  oklch(0.55 0.17 270)
    "#8e57d8", // violet:  oklch(0.58 0.19 300)
    "#ca44c3", // fuchsia: oklch(0.62 0.22 330)
    "#74716b", // stone:   oklch(0.55 0.01 90)
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

    /// Every palette entry must be a lowercase `#rrggbb` hex value — the same
    /// shape finance's `colourFromName` produces for institutions — not the
    /// fixture's palette id.
    #[test]
    fn every_palette_entry_is_a_lowercase_hex_colour() {
        for colour in ENTITY_COLOURS {
            assert_eq!(colour.len(), 7, "expected #rrggbb, got {colour}");
            assert!(colour.starts_with('#'), "expected #rrggbb, got {colour}");
            assert!(
                colour[1..]
                    .chars()
                    .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
                "expected lowercase hex digits, got {colour}"
            );
        }
    }
}
