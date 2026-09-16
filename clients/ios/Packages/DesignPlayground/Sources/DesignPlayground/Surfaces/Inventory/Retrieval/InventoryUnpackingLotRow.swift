import DesignSystem
import SwiftUI

/// One still-packed item, with the two ways it can leave: a chosen
/// destination, or the hand, kept there for whoever is carrying things
/// around while the room gets built out. Selection is a checkbox instead of
/// swipe or long-press because the multi-select variant needs it visible at
/// a glance across the whole list, not discovered one row at a time.
internal struct InventoryUnpackingLotRow: View {
    internal let lot: InventoryUnpackingLot
    internal let allowsSelection: Bool
    internal let isSelected: Bool
    internal let onToggleSelection: () -> Void
    internal let onKeepInHand: () -> Void
    internal let onChooseDestination: () -> Void

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            if allowsSelection {
                Button(action: onToggleSelection) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.popsHeadline)
                        .foregroundStyle(
                            isSelected ? Color.popsInventory : Color.popsMutedForeground)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isSelected ? "Selected" : "Not selected")
            }
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryItemRow(item: lot.item)
                if !allowsSelection {
                    actions
                }
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private var actions: some View {
        HStack(spacing: PopsSpacing.sm) {
            Button("Move to…", action: onChooseDestination)
                .font(.popsSubheadline.weight(.semibold))
                .playgroundGlassButton()
                .tint(.popsInventory)
            Button("Keep in hand", action: onKeepInHand)
                .font(.popsSubheadline.weight(.semibold))
                .playgroundGlassButton()
        }
        .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
    }
}
