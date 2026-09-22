import AppCore
import SwiftUI

extension View {
    /// Adds Inventory selection, placement, feedback, form and sync presentation around search rows.
    public func inventorySearchChrome(
        _ session: InventorySearchSession,
        records: [InventorySearchResult],
        store: any InventoryStore
    ) -> some View {
        modifier(InventorySearchChrome(session: session, results: records, store: store))
    }
}

private struct InventorySearchChrome: ViewModifier {
    @Bindable var session: InventorySearchSession
    let results: [InventorySearchResult]
    let store: any InventoryStore

    private var records: [InventoryRecord] { results.compactMap(\.record) }

    func body(content: Content) -> some View {
        content
            .inventoryRecordSelectionBar(
                $session.selection,
                records: records,
                writer: session.writer,
                moving: $session.moving
            )
            .inventoryPlacementPicker($session.moving, runner: session.runner) { _ in
                session.settleMove(succeeded: true)
            }
            .inventoryRunnerChrome(session.runner)
            .inventoryWriterFeedback(session.writer)
            .inventoryItemFormPresentation(store: store)
            .inventorySyncInterruptions(store: store)
    }
}
