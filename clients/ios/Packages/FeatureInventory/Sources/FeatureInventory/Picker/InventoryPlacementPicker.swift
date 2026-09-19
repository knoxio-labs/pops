import AppCore
import SwiftUI

extension View {
    /// The one placement picker, for any screen in this feature: set
    /// `request` and the sheet opens, reads the replica, and on commit issues
    /// the moves (creating a place first when one was named inline) through
    /// `runner`, which then offers Undo and reports a failure the same way the
    /// calling screen's own writes do. `onPlaced` runs once the moves land.
    ///
    /// See the package README for when to use it rather than
    /// `InventoryDestinationPickerSheet`, which only chooses.
    internal func inventoryPlacementPicker(
        _ request: Binding<InventoryPlacementRequest?>,
        runner: InventoryCommandRunner,
        onPlaced: @escaping @MainActor (InventoryPlacementRequest) -> Void = { _ in }
    ) -> some View {
        sheet(item: request) { current in
            InventoryPlacementPickerSheet(request: current, runner: runner, onPlaced: onPlaced)
        }
    }
}

/// The picker sheet bound to the replica: loading until the choices arrive,
/// then the chooser, and the commit carried out after it closes.
internal struct InventoryPlacementPickerSheet: View {
    internal let request: InventoryPlacementRequest
    internal let runner: InventoryCommandRunner
    internal let onPlaced: @MainActor (InventoryPlacementRequest) -> Void
    @State private var choices: InventoryObservation<InventoryPlacementChoices>
    @State private var generation = 0

    internal init(
        request: InventoryPlacementRequest, runner: InventoryCommandRunner,
        onPlaced: @escaping @MainActor (InventoryPlacementRequest) -> Void
    ) {
        self.request = request
        self.runner = runner
        self.onPlaced = onPlaced
        let subject = request.subject
        _choices = State(
            initialValue: InventoryObservation(
                store: runner.store,
                query: InventoryQuery { InventoryPlacementChoices(reading: $0, for: subject) }))
    }

    internal var body: some View {
        Group {
            switch choices.phase {
            case .loading:
                InventoryDestinationPickerSheet(
                    title: request.title, commitTitle: request.commitTitle,
                    tree: InventoryLocationTree(nodes: []),
                    state: InventoryDestinationPickerState(isLoading: true))
            case .unavailable:
                NavigationStack {
                    InventoryUnavailableView { generation += 1 }
                        .navigationTitle(request.title)
                        .inventoryTitleDisplay(large: false)
                }
            case .loaded(let loaded):
                chooser(loaded)
            }
        }
        .task(id: generation) { await choices.observe() }
    }

    private func chooser(_ loaded: InventoryPlacementChoices) -> some View {
        InventoryDestinationPickerSheet(
            title: request.title, commitTitle: request.commitTitle, tree: loaded.tree,
            putBack: loaded.putBack, recent: loaded.recent, containers: loaded.containers,
            offered: loaded.offered,
            effect: { destination in
                guard case .location(let id) = request.subject else { return nil }
                return loaded.tree.moveEffect(of: id, to: destination.id)
            },
            onChoose: { destination in
                let plan = InventoryPlacementPlan(
                    request: request, destination: destination, tree: loaded.tree)
                Task { @MainActor in
                    let placed = await runner.perform(
                        plan.commands, announcing: plan.message, symbol: symbol(for: destination))
                    if placed { onPlaced(request) }
                }
            })
    }

    private func symbol(for destination: InventoryDestination) -> InventorySymbol {
        if case .putBack = destination.kind { return .restore }
        return request.verb == .store ? .storeHere : .move
    }
}
