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

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(items) { item in
                    ChipButton(chip: item, isOn: isOn(item.id)) { select(item.id) }
                        // The identity a `ScrollViewReader` scrolls back to.
                        .id(item.id)
                }
            }
        }
        .scrollIndicators(.hidden)
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
            .background(
                isOn ? Color.popsAccent : Color.popsSeparator.opacity(0.35),
                in: .capsule
            )
            .foregroundStyle(isOn ? Color.popsBackground : Color.popsForeground)
        }
        .buttonStyle(.plain)
    }
}
