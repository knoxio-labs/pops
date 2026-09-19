import DesignSystem
import SwiftUI

/// The in-hand rows inside a list panel: photo, name over where each came
/// from, Put back on the trailing edge, and the same swipes everywhere.
internal struct InventoryInHandRows: View {
    internal let items: [InventoryDashboard.InHandItem]
    internal let onPutBack: (InventoryDashboard.InHandItem) -> Void
    internal let onMove: (InventoryDashboard.InHandItem) -> Void
    internal let loadPhoto: @MainActor (String) async -> Data?
    @State private var activeSwipe: String?

    internal var body: some View {
        InventoryGroundedListPanel {
            VStack(spacing: PopsSpacing.zero) {
                ForEach(items) { item in
                    row(item)
                        .transition(InventoryMotion.row)
                    if item.id != items.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    private func row(_ item: InventoryDashboard.InHandItem) -> some View {
        NavigationLink(value: InventoryRoute.record(id: item.id, isContainer: item.access != nil)) {
            InventoryInHandRowLabel(
                item: item, loadPhoto: loadPhoto, onPutBack: { onPutBack(item) },
                onMove: { onMove(item) })
        }
        .buttonStyle(.plain)
        .inventoryInHandSwipes(
            canPutBack: item.previous.putBackPlacement != nil,
            isActive: activeSwipe == item.id,
            onPresentationChanged: { presented in
                if presented {
                    activeSwipe = item.id
                } else if activeSwipe == item.id {
                    activeSwipe = nil
                }
            },
            onMove: { onMove(item) },
            onPutBack: { onPutBack(item) })
    }
}

/// One thing in hand in the dashboard's row idiom: its photo, its name over
/// where it came from, the quiet sync mark, and Put back as an icon button,
/// or Move when there is nowhere to put it back.
internal struct InventoryInHandRowLabel: View {
    internal let item: InventoryDashboard.InHandItem
    internal let loadPhoto: @MainActor (String) async -> Data?
    internal let onPutBack: () -> Void
    internal let onMove: () -> Void

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(
                photo: item.photo, symbol: .record(access: item.access), load: loadPhoto)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(item.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(Self.fromLine(item.previous))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: PopsSpacing.sm)
            InventorySyncMarker(sync: item.sync)
            InventoryQuantityBadge(quantity: item.quantity)
            if case .place(let name, _) = item.previous {
                iconButton(.restore, label: "Put back", action: onPutBack)
                    .accessibilityHint("Returns it to \(name)")
            } else {
                iconButton(.move, label: "Move", action: onMove)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }

    /// The row's second line: where it came from, or why Put back is gone.
    nonisolated internal static func fromLine(_ previous: InventoryPreviousPlace) -> String {
        switch previous {
        case .place(let name, _): "From \(name)"
        case .deleted: "Previous place deleted"
        case .nowhere: "Nowhere recorded"
        }
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
    /// The swipe actions every in-hand row carries: Move on the leading edge,
    /// Put back on the trailing one when there is somewhere to go back to.
    internal func inventoryInHandSwipes(
        canPutBack: Bool,
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
                    if canPutBack {
                        Button(action: onPutBack) {
                            Label("Put back", systemImage: "arrow.uturn.backward.circle.fill")
                        }
                        .tint(.popsSuccess)
                    }
                })
    }
}
