import DesignSystem
import SwiftUI

/// The lifecycle section an item's detail page shows: what state it is in,
/// why, whether that can be undone, and whether anything about it survives
/// the change.
///
/// Built on ``InventoryStateMark`` rather than beside it, so this and a plain
/// row disagree about nothing except how much room there is to say it in.
internal struct InventoryLifecycleDispositionSummary: View {
    internal let item: InventoryFoundationItem
    internal let reason: InventoryDiscardReason?
    @Environment(\.inventoryLifecycleStyle) private var style

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.xs) {
                ForEach(InventoryStateMark.marks(for: item)) { mark in
                    InventoryStateBadge(mark: labelled(mark))
                }
                if let reason, style.reasonPresentation == .reasonChip {
                    InventoryStateBadge(
                        mark: InventoryStateMark(
                            id: "reason", label: reason.label, symbol: reason.symbol.system,
                            isHighlighted: false))
                }
            }
            if item.lifecycle.isRestorable {
                Text("Can be restored. Counts again from the moment it is.")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if item.lifecycle != .active {
                Text("Photos, purchase details and documents stay attached to the record.")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Under `reasonReplacesLabel`, the lifecycle badge itself says why rather
    /// than that it was discarded; every other treatment leaves the badge
    /// alone and lets the chip above carry the reason.
    private func labelled(_ mark: InventoryStateMark) -> InventoryStateMark {
        guard mark.id == "lifecycle", let reason, style.reasonPresentation == .reasonReplacesLabel
        else { return mark }
        return InventoryStateMark(
            id: mark.id, label: reason.label, symbol: reason.symbol.system,
            isHighlighted: mark.isHighlighted)
    }
}
