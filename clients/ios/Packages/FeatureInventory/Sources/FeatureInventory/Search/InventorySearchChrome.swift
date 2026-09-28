import AppCore
import SwiftUI

extension View {
    /// Adds Inventory selection, placement, feedback, form and sync presentation around search rows.
    /// `barcodeLookup` supplies prefill for item forms opened from search destinations.
    /// `codeSuggestions` supplies the server-backed suggester for those forms.
    public func inventorySearchChrome(
        _ session: InventorySearchSession,
        records: [InventorySearchResult],
        store: any InventoryStore,
        barcodeLookup: any InventoryBarcodeLookupService,
        codeSuggestions: any InventoryCodeSuggestionService
    ) -> some View {
        let suggester = InventoryCodeSuggester { name, typeKey, stem in
            try await codeSuggestions.suggestCodes(name: name, typeKey: typeKey, stem: stem)
        }
        return modifier(
            InventorySearchChrome(
                session: session, results: records, store: store,
                suggester: suggester, scan: .system(lookup: barcodeLookup)))
    }
}

private struct InventorySearchChrome: ViewModifier {
    @Bindable var session: InventorySearchSession
    let results: [InventorySearchResult]
    let store: any InventoryStore
    let suggester: InventoryCodeSuggester?
    let scan: InventoryScanPrefill

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
            .inventoryItemFormPresentation(store: store, suggester: suggester, scan: scan)
            .inventorySyncInterruptions(store: store)
    }
}
