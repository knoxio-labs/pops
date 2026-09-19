import SwiftUI

/// Recent activity: the item History page over every record's newest
/// events, with the same lines, kind filter, event sheet and Undo.
internal struct InventoryRecentActivityView: View {
    @State private var model: InventoryRecentActivityModel
    @State private var generation = 0

    internal init(model: InventoryRecentActivityModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        Group {
            if model.activity.phase == .unavailable {
                InventoryUnavailableView { generation += 1 }
            } else {
                InventoryItemHistoryView(
                    title: "Recent activity", name: "Everything, newest first",
                    entries: model.entries, isLoading: model.isLoading
                ) { entry in
                    Task { await model.undo(entry) }
                }
            }
        }
        .task(id: generation) { await model.observe() }
        .inventoryRunnerChrome(model.runner)
    }
}
