import AppCore
import DesignSystem
import SwiftUI

extension View {
    /// New place from a screen that does not already hold the location tree:
    /// set `isPresented` and the sheet reads the replica for itself, then
    /// opens the same `InventoryLocationCreateSheet` the Locations screens
    /// open, writing through `runner`.
    ///
    /// The Locations browser and a place's own page pass their loaded tree
    /// straight to that sheet. This exists for the callers that have no tree
    /// to pass — the dashboard's Add menu is the first.
    internal func inventoryLocationCreateSheet(
        isPresented: Binding<Bool>, runner: InventoryCommandRunner
    ) -> some View {
        sheet(isPresented: isPresented) {
            InventoryLocationCreateSheetHost(runner: runner)
        }
    }
}

/// The New place sheet bound to the replica: loading until the tree arrives,
/// then the real form. Mirrors `InventoryPlacementPickerSheet`, which loads
/// its own choices the same way and for the same reason.
internal struct InventoryLocationCreateSheetHost: View {
    internal let runner: InventoryCommandRunner
    @State private var tree: InventoryObservation<InventoryLocationTree>
    @State private var generation = 0

    internal init(runner: InventoryCommandRunner) {
        self.runner = runner
        _tree = State(
            initialValue: InventoryObservation(
                store: runner.store,
                query: InventoryQuery { InventoryLocationTree(reading: $0) }))
    }

    internal var body: some View {
        Group {
            switch tree.phase {
            case .loading:
                chrome { LoadingStateView() }
            case .unavailable:
                chrome { InventoryUnavailableView { generation += 1 } }
            case .loaded(let loaded):
                InventoryLocationCreateSheet(tree: loaded, runner: runner)
            }
        }
        .task(id: generation) { await tree.observe() }
    }

    private func chrome(@ViewBuilder content: () -> some View) -> some View {
        NavigationStack {
            content()
                .navigationTitle("New place")
                .inventoryTitleDisplay(large: false)
        }
        .presentationDetents([.medium, .large])
        .tint(.popsInventory)
    }
}
