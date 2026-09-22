import DesignSystem
import SwiftUI

extension View {
    /// Selection mode's chrome for one list: Cancel and Select all in the
    /// navigation bar, and the list's actions either side of the count in a
    /// bottom bar that replaces the tab bar. Each action receives the
    /// selected ids; the list clears the selection once the action lands.
    internal func inventorySelectionBar(
        _ selection: Binding<InventorySelection>,
        all ids: [String],
        actions: [InventorySelectionAction]
    ) -> some View {
        modifier(InventorySelectionBarModifier(selection: selection, all: ids, actions: actions))
    }
}

/// One thing a selection bar offers to do with what is selected.
internal struct InventorySelectionAction: Identifiable {
    internal let title: String
    internal let symbol: InventorySymbol
    internal let perform: (Set<String>) -> Void

    internal var id: String { title }
}

private struct InventorySelectionBarModifier: ViewModifier {
    @Binding var selection: InventorySelection
    let all: [String]
    let actions: [InventorySelectionAction]

    func body(content: Content) -> some View {
        content
            .toolbar {
                if selection.isSelecting {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { selection.deselectAll() }
                            .tint(.popsInventory)
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button(selection.isAllSelected(all) ? "Deselect all" : "Select all") {
                            selection.toggleAll(all)
                        }
                        .tint(.popsInventory)
                    }
                    ToolbarItemGroup(placement: .inventoryBottomBar) { leadingAction }
                    ToolbarItem(placement: .inventoryBottomBar) { count }
                        .inventoryOwnBackground()
                    ToolbarItemGroup(placement: .inventoryBottomBar) { trailingActions }
                }
            }
            .navigationBarBackButtonHidden(selection.isSelecting)
            .inventoryHidesTabBar(selection.isSelecting)
    }

    @ViewBuilder private var leadingAction: some View {
        if let first = actions.first {
            button(first)
        }
    }

    private var count: some View {
        Text("\(selection.count) selected")
            .font(.popsSectionLabel)
            .monospacedDigit()
            .contentTransition(.numericText(value: Double(selection.count)))
            .fixedSize()
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            .popsGlass(in: Capsule())
    }

    @ViewBuilder private var trailingActions: some View {
        ForEach(actions.dropFirst()) { action in
            button(action)
        }
    }

    private func button(_ action: InventorySelectionAction) -> some View {
        Button {
            action.perform(selection.ids)
        } label: {
            Label {
                Text(action.title)
            } icon: {
                action.symbol.image
            }
        }
        .tint(.popsInventory)
        .accessibilityLabel(action.title)
    }
}
