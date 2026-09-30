import SwiftUI

/// Recent activity: the item History page over every record's newest
/// events, with the same lines, kind filter, event sheet and Undo.
internal struct InventoryRecentActivityView: View {
    @State private var model: InventoryRecentActivityModel

    internal init(model: InventoryRecentActivityModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        InventoryItemHistoryView(
            title: "Recent activity", name: "Everything, newest first", model: model
        )
        .inventoryRunnerChrome(model.runner)
    }
}
