import AppCore
import FeatureInventory
import FeaturePurchases
import Testing

@testable import Pops

/// The rule `ContentView` hands its `TabView` for which tab shows.
///
/// The bug that made the selection explicit — the tab dropping back to the
/// first whenever a tab's root view changed — lives in `TabView` itself. What
/// these pin is the rule that replaced the implicit selection, including the
/// case it now has to get right on its own: a reload that removes the chosen
/// feature.
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
            chosen: FeaturePurchases.feature,
            available: [Self.transactions, FeaturePurchases.feature, Self.receipts])
        #expect(shown == FeaturePurchases.feature)
    }

    @Test("a chosen feature a reload removed falls back to the first")
    func aRemovedFeatureFallsBack() {
        let shown = ContentView.shownFeature(
            chosen: Self.receipts, available: [Self.accounts, Self.transactions])
        #expect(shown == Self.accounts)
    }

    @Test("choosing the search tab keeps it shown")
    func theSearchTabStaysChosen() {
        let tabs = ContentView.tabs(for: [Self.transactions, FeatureInventory.feature])
        let shown = ContentView.shownFeature(chosen: ContentView.searchTab, available: tabs)
        #expect(shown == ContentView.searchTab)
    }

    @Test("the search tab goes once every searchable pillar does, and the selection falls back")
    func theSearchTabLeavesWithEverySearchablePillar() {
        let tabs = ContentView.tabs(for: [Self.transactions, Self.accounts])
        #expect(tabs == [ContentView.moreTab])
        let shown = ContentView.shownFeature(chosen: ContentView.searchTab, available: tabs)
        #expect(shown == ContentView.moreTab)
    }
    @Test("the full fleet keeps Inventory visible and leaves room for the search bubble")
    func fullFleetGroupsSecondaryFeatures() {
        let purchases = MobileFeature(rawValue: "purchases")
        let available = [
            Self.transactions, Self.accounts, purchases, Self.receipts, FeatureInventory.feature,
        ]
        #expect(
            ContentView.tabs(for: available) == [
                purchases, Self.receipts, FeatureInventory.feature,
                ContentView.moreTab, ContentView.searchTab,
            ])
        #expect(ContentView.moreFeatures(for: available) == [Self.transactions, Self.accounts])
    }

    @Test("Purchases alone still gets a tab bar, for the search tab")
    func purchasesAloneGetsATabBarForSearch() {
        let purchases = MobileFeature(rawValue: "purchases")
        #expect(ContentView.tabs(for: [purchases]) == [purchases, ContentView.searchTab])
    }

    @Test("More disappears when neither secondary feature is available")
    func moreRequiresAvailableFeatures() {
        #expect(ContentView.tabs(for: []) == [])
        #expect(ContentView.tabs(for: [Self.receipts]) == [Self.receipts])
        #expect(ContentView.tabs(for: [Self.accounts]) == [ContentView.moreTab])
        #expect(
            ContentView.shownFeature(chosen: ContentView.moreTab, available: [Self.receipts])
                == Self.receipts)
    }
}
