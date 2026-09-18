import DesignSystem
import SwiftUI

/// One row of a pick list: a sheet that asks which of a few items to act on,
/// such as Store here's existing items.
///
/// Not selection mode. The row keeps its ordinary leading mark, the photo or
/// the kind's glyph, and a picked row gains a small amber tick on the mark's
/// corner rather than a tinted background, because the list is the question
/// and every row in it is expected to be answered. A tap anywhere on the row
/// toggles it.
internal struct InventoryPickRow<Subtitle: View>: View {
    private let name: String
    private let mark: InventoryRecordMark
    private let isPicked: Bool
    private let toggle: () -> Void
    private let subtitle: Subtitle

    internal init(
        name: String,
        mark: InventoryRecordMark,
        isPicked: Bool,
        toggle: @escaping () -> Void,
        @ViewBuilder subtitle: () -> Subtitle
    ) {
        self.name = name
        self.mark = mark
        self.isPicked = isPicked
        self.toggle = toggle
        self.subtitle = subtitle()
    }

    internal var body: some View {
        Button(action: toggle) {
            HStack(spacing: PopsSpacing.md) {
                mark
                    .overlay(alignment: .bottomTrailing) {
                        if isPicked {
                            tick.transition(.scale.combined(with: .opacity))
                        }
                    }
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(name)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    subtitle
                }
                Spacer(minLength: PopsSpacing.sm)
            }
            .padding(.vertical, PopsSpacing.xs)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
        .inventoryMotion(value: isPicked)
    }

    private var tick: some View {
        Image(systemName: "checkmark.circle.fill")
            .font(.popsSubheadline.weight(.semibold))
            .symbolRenderingMode(.palette)
            .foregroundStyle(Color.popsBackground, Color.popsInventory)
            .background(Color.popsBackground, in: .circle)
            .offset(x: PopsSpacing.xs, y: PopsSpacing.xs)
            .accessibilityHidden(true)
    }
}

/// The path from a place to the thing holding an item, or In hand.
///
/// Collapses to place … container when the full path will not fit, rather
/// than truncating mid-word: the two ends are the ones a reader needs.
internal struct InventoryPlacementPath: View {
    internal let crumbs: [String]
    internal let isInHand: Bool

    internal var body: some View {
        if isInHand {
            Label {
                Text("In hand")
            } icon: {
                InventorySymbol.inHand.image
            }
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsInventory)
        } else if crumbs.isEmpty {
            Text("Location unknown")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        } else {
            ViewThatFits(in: .horizontal) {
                trail(crumbs)
                trail(collapsed)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(crumbs.joined(separator: ", then "))
        }
    }

    private var collapsed: [String] {
        guard crumbs.count > 2, let first = crumbs.first, let last = crumbs.last else {
            return crumbs
        }
        return [first, "…", last]
    }

    private func trail(_ crumbs: [String]) -> some View {
        HStack(spacing: PopsSpacing.xs) {
            ForEach(Array(crumbs.enumerated()), id: \.offset) { index, crumb in
                if index > 0 {
                    Image(systemName: "chevron.forward")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Text(crumb)
                    .font(.popsCaption)
                    .foregroundStyle(
                        index == crumbs.count - 1 ? Color.popsForeground : Color.popsMutedForeground
                    )
                    .lineLimit(1)
                    .fixedSize()
            }
        }
    }
}
