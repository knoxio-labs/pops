import DesignSystem
import SwiftUI

/// A row of switchable options that scrolls when it outgrows its width.
///
/// Used at two very different sizes — the bar's states, where a surface may
/// declare twenty, and the panel's chrome — so it carries no padding and no
/// background of its own. Each caller insets and fills it for the place it is
/// going.
internal struct ChipStrip: View {
    let items: [Chip]
    let isOn: (String) -> Bool
    let select: (String) -> Void
    /// How far the chips sit inside whatever is drawn behind them. Applied to
    /// the chips rather than to the strip so that when they do scroll they
    /// pass under its ends, instead of stopping a step short of them.
    var inset: CGFloat = PopsSpacing.zero

    /// Two chips in a strip sized for twenty is a capsule mostly full of
    /// nothing, so the strip takes only the width it needs until the chips
    /// outgrow it and scrolling is what it is for.
    var body: some View {
        ViewThatFits(in: .horizontal) {
            chips.padding(.horizontal, inset)

            ScrollView(.horizontal) { chips }
                .scrollIndicators(.hidden)
                .contentMargins(.horizontal, inset, for: .scrollContent)
        }
    }

    private var chips: some View {
        HStack(spacing: PopsSpacing.sm) {
            ForEach(items) { item in
                ChipButton(chip: item, isOn: isOn(item.id)) { select(item.id) }
                    // The identity a `ScrollViewReader` scrolls back to.
                    .id(item.id)
            }
        }
    }
}

/// One switchable option in the inspector. A named type rather than a tuple:
/// three members is past where a tuple stops explaining itself, and these are
/// built at three call sites that would otherwise have to agree by position.
internal struct Chip: Identifiable {
    internal let id: String
    internal let title: String
    internal var symbol: String?
}

internal struct ChipButton: View {
    let chip: Chip
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.xs) {
                if let symbol = chip.symbol {
                    Image(systemName: symbol).font(.popsSectionLabel)
                }
                Text(chip.title).font(.popsCaption)
            }
            .padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            // `popsSeparator` is a hairline colour, and at a third of its
            // opacity an unselected chip disappeared entirely against dark
            // glass — twenty variants read as nineteen floating labels and one
            // button. A scrim off the foreground is legible over either
            // scheme's glass without becoming a second filled state.
            .background(
                isOn ? Color.popsAccent : Color.popsForeground.opacity(0.12),
                in: .capsule
            )
            .foregroundStyle(isOn ? Color.popsBackground : Color.popsForeground)
        }
        .buttonStyle(.plain)
    }
}
