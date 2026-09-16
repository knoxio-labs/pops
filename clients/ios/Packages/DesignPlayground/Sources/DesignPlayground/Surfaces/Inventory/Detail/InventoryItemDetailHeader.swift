import DesignSystem
import SwiftUI

/// The one action a placement makes obvious: Pick up, Put back, Move, or
/// Restore. Reuses ``InventoryAction/available(for:style:)`` rather than
/// re-deriving when each applies, so this page cannot disagree with the
/// sheet the same item's actions open into.
internal enum InventoryItemDetailPrimaryAction {
    /// Restore first, because it is the only thing an inactive item can do;
    /// then the placement verbs, in the order a person would reach for them.
    private static let priority = ["restore", "put-back", "pick-up", "move"]

    internal static func choose(
        for item: InventoryFoundationItem,
        style: InventoryFoundationStyle
    ) -> InventoryAction? {
        let actions = InventoryAction.available(for: item, style: style)
        for id in priority {
            if let match = actions.first(where: { $0.id == id }) { return match }
        }
        return actions.first
    }
}

/// Photo, name, code, quantity and lifecycle, the identity a person confirms
/// before doing anything else. The row underneath is ``InventoryItemRow``
/// unchanged, so a detail page and a list row never disagree about what an
/// item's state looks like.
internal struct InventoryItemDetailHeader: View {
    internal let detail: InventoryItemDetail
    internal let primary: InventoryAction?
    internal let onPrimary: () -> Void
    @Environment(\.inventoryItemDetailStyle) private var style

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            if !detail.photos.isEmpty {
                InventoryItemDetailGallery(photos: detail.photos)
            } else {
                InventoryItemDetailPlate(photo: nil)
            }
            InventoryItemRow(item: detail.item)
            if style.actionPlacement == .header, let primary {
                InventoryItemDetailPrimaryButton(action: primary, onTap: onPrimary)
            }
        }
    }
}

/// The primary action, drawn the same whether the header or the bottom bar
/// hosts it, so the action-placement experiment compares only where it sits.
internal struct InventoryItemDetailPrimaryButton: View {
    internal let action: InventoryAction
    internal let onTap: () -> Void

    internal var body: some View {
        Button(action: onTap) {
            Label(action.title, systemImage: action.symbol.system)
                .font(.popsSubheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
        }
        .playgroundGlassButton()
        .tint(.popsInventory)
        .accessibilityHint(action.note ?? "")
    }
}
