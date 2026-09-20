import AppCore
import FeatureInventory
import Testing

@testable import Pops

/// The rule `ContentView` hands its `TabView` for which tab shows.
///
/// The bug that made the selection explicit — the tab dropping back to the
/// first whenever a tab's root view changed — lives in `TabView` itself and
/// is caught end to end by `receipt-manual-entry.yaml`. What these pin is the
/// rule that replaced the implicit selection, including the case it now has to
/// get right on its own: a reload that removes the chosen feature.
@Suite("ContentView tab selection")
internal struct ContentViewTabSelectionTests {
    private static let transactions = MobileFeature(rawValue: "transactions")
    private static let accounts = MobileFeature(rawValue: "accounts")
    private static let receipts = MobileFeature(rawValue: "receipt-capture")

    @Test("with nothing chosen, the first feature shows")
    func nothingChosenShowsTheFirst() {
        let shown = ContentView.shownFeature(
            chosen: nil, available: [Self.transactions, Self.receipts])
        #expect(shown == Self.transactions)
    }

    @Test("a chosen feature the BFM still offers stays shown")
    func aChosenFeatureStays() {
        let shown = ContentView.shownFeature(
            chosen: Self.receipts, available: [Self.transactions, Self.accounts, Self.receipts])
        #expect(shown == Self.receipts)
    }

    @Test("a chosen feature a reload removed falls back to the first")
    func aRemovedFeatureFallsBack() {
        let shown = ContentView.shownFeature(
            chosen: Self.receipts, available: [Self.accounts, Self.transactions])
        #expect(shown == Self.accounts)
    }

    @Test("choosing Inventory's search tab keeps it shown")
    func theInventorySearchTabStaysChosen() {
        let tabs = ContentView.tabs(for: [Self.transactions, FeatureInventory.feature])
        let shown = ContentView.shownFeature(
            chosen: ContentView.inventorySearchTab, available: tabs)
        #expect(shown == ContentView.inventorySearchTab)
    }

    @Test("the search tab goes when Inventory does, and the selection falls back")
    func theSearchTabLeavesWithInventory() {
        let tabs = ContentView.tabs(for: [Self.transactions, Self.accounts])
        #expect(tabs == [Self.transactions, Self.accounts])
        let shown = ContentView.shownFeature(
            chosen: ContentView.inventorySearchTab, available: tabs)
        #expect(shown == Self.transactions)
    }
}
