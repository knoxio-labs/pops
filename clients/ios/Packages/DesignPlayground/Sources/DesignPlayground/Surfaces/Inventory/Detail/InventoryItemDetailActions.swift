import DesignSystem
import SwiftUI

/// Edit, print or copy the code, and share. Page chrome rather than one of
/// ADR-001's verbs, so it lives in the nav bar instead of
/// ``InventoryActionList``, which stays exactly what a long-press already
/// opens.
internal struct InventoryItemDetailMenu: View {
    internal let detail: InventoryItemDetail
    internal let onMore: () -> Void

    internal var body: some View {
        Menu {
            Button {
            } label: {
                Label("Edit", systemImage: "pencil")
            }
            if detail.item.code != nil {
                Button {
                } label: {
                    Label("Copy code", systemImage: InventorySymbol.code.system)
                }
                Button {
                } label: {
                    Label("Print label", systemImage: "printer")
                }
            }
            Button {
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            Divider()
            Button(action: onMore) {
                Label("More actions", systemImage: "ellipsis.circle")
            }
        } label: {
            Label("Actions", systemImage: "ellipsis.circle")
        }
    }
}

/// The primary action pinned to the bottom edge, the action-placement
/// experiment's other pole from the header.
internal struct InventoryItemDetailBottomBar: View {
    internal let action: InventoryAction
    internal let onPrimary: () -> Void

    internal var body: some View {
        InventoryItemDetailPrimaryButton(action: action, onTap: onPrimary)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
    }
}
