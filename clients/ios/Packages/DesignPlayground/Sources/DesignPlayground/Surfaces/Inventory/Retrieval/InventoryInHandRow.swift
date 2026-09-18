import DesignSystem
import SwiftUI

/// One thing in hand in the dashboard's row idiom: its photo, its name over
/// where it came from, the quiet sync mark, and Put back as an icon button,
/// or Move when there is nowhere to put it back.
internal struct InventoryInHandRowLabel: View {
    internal let retrieval: InventoryRetrievalItem
    internal let onPutBack: () -> Void
    internal let onMove: () -> Void

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(photo: retrieval.photo, symbol: retrieval.item.symbol.system)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(retrieval.item.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(retrieval.fromLine)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: PopsSpacing.sm)
            InventorySyncMarker(sync: retrieval.item.sync)
            InventoryQuantityBadge(quantity: retrieval.item.quantity)
            if InventoryRetrieval.canPutBack(retrieval) {
                iconButton(.restore, label: "Put back", action: onPutBack)
                    .accessibilityHint(
                        retrieval.previousPlacement.map { "Returns it to \($0)" } ?? "")
            } else {
                iconButton(.move, label: "Move", action: onMove)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }

    private func iconButton(
        _ symbol: InventorySymbol, label: String, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            symbol.image
                .font(.popsHeadline)
                .foregroundStyle(Color.popsInventory)
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

extension View {
    /// The swipe actions every in-hand row carries, exactly as the dashboard's:
    /// Move on the leading edge, Put back on the trailing one when there is
    /// somewhere to go back to.
    internal func inventoryInHandSwipes(
        _ retrieval: InventoryRetrievalItem,
        isActive: Bool,
        onPresentationChanged: @escaping (Bool) -> Void,
        onMove: @escaping () -> Void,
        onPutBack: @escaping () -> Void
    ) -> some View {
        inventoryGroundedSwipeRow(isActive: isActive)
            .inventoryGroundedSwipeActions(
                edge: .leading, onPresentationChanged: onPresentationChanged,
                actions: {
                    Button(action: onMove) {
                        Label("Move to…", systemImage: "folder.fill")
                    }
                    .tint(.popsAccent)
                }
            )
            .inventoryGroundedSwipeActions(
                edge: .trailing, onPresentationChanged: onPresentationChanged,
                actions: {
                    if InventoryRetrieval.canPutBack(retrieval) {
                        Button(action: onPutBack) {
                            Label("Put back", systemImage: "arrow.uturn.backward.circle.fill")
                        }
                        .tint(.popsSuccess)
                    }
                })
    }
}
