import DesignSystem
import SwiftUI

/// One row of a pick list: a sheet that asks which of a few items to act on,
/// such as Type arrived's matches or Store here's existing items.
///
/// Not selection mode. The row keeps its ordinary leading mark, the photo or
/// the kind's glyph, and a picked row gains a small amber tick on the mark's
/// corner rather than a tinted background, because the list is the question
/// and every row in it is expected to be answered. A tap anywhere on the row
/// toggles it.
internal struct InventoryPickRow<Subtitle: View>: View {
    private let item: InventoryFoundationItem
    private let isPicked: Bool
    private let toggle: () -> Void
    private let subtitle: Subtitle

    internal init(
        item: InventoryFoundationItem,
        isPicked: Bool,
        toggle: @escaping () -> Void,
        @ViewBuilder subtitle: () -> Subtitle
    ) {
        self.item = item
        self.isPicked = isPicked
        self.toggle = toggle
        self.subtitle = subtitle()
    }

    /// A container without a photo keeps its squared amber mark, as on every
    /// other screen; anything else is the Items row's mark.
    @ViewBuilder private var mark: some View {
        let photo = InventorySearchFixtures.record(id: item.id)?.photo
        if item.isContainer, photo == nil {
            InventoryItemMark(item: item)
        } else {
            InventoryRecordMark(
                photo: photo, symbol: item.symbol.system,
                showsKindBadge: item.isContainer && !isPicked)
        }
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
                    Text(item.name)
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
