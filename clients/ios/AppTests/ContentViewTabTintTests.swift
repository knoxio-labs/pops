import AppCore
import DesignSystem
import FeatureInventory
import FeaturePurchases
import SwiftUI
import Testing

@testable import Pops

/// POPS-4209: the tab bar tints the item that is selected, so tinting the
/// whole `TabView` from the selection is what makes each feature colour belong
/// to its own tab rather than to whichever tab happens to be chosen.
///
/// These pin the rule, not the rendering: `nil` is what restores the
/// platform's own tint, and tabs without a feature colour must get it.
@Suite("ContentView tab tint")
internal struct ContentViewTabTintTests {
    private static let transactions = MobileFeature(rawValue: "transactions")
    private static let accounts = MobileFeature(rawValue: "accounts")
    private static let receipts = MobileFeature(rawValue: "receipt-capture")

    @Test("Inventory selected tints the tab bar with Inventory's amber")
    func inventorySelectedIsAmber() {
        #expect(ContentView.tabTint(for: FeatureInventory.feature) == Color.popsInventory)
    }

    @Test("Purchases selected tints the tab bar with Purchases' colour")
    func purchasesSelectedUsesPurchasesTint() {
        #expect(ContentView.tabTint(for: FeaturePurchases.feature) == Color.popsPurchases)
    }

    @Test("every other feature keeps the app's usual tint")
    func otherFeaturesKeepTheDefault() {
        for feature in [Self.transactions, Self.accounts, Self.receipts] {
            #expect(
                ContentView.tabTint(for: feature) == nil,
                Comment(rawValue: "\(feature.rawValue) no longer keeps the platform's own tint"))
        }
    }

    @Test("Inventory's search sibling is not the Inventory tab item")
    func theSearchSiblingKeepsTheDefault() {
        #expect(ContentView.tabTint(for: ContentView.inventorySearchTab) == nil)
    }

    @Test("the amber is never the tint while another tab is the one shown")
    func amberFollowsTheSelection() {
        let tabs = ContentView.tabs(for: [Self.transactions, FeatureInventory.feature])
        let shown = ContentView.shownFeature(chosen: ContentView.moreTab, available: tabs)
        #expect(ContentView.tabTint(for: shown) == nil)
    }

    @Test("the feature tint follows selection between Purchases and Inventory")
    func tintFollowsTheSelection() {
        let tabs = ContentView.tabs(for: [FeaturePurchases.feature, FeatureInventory.feature])
        let purchasesShown = ContentView.shownFeature(
            chosen: FeaturePurchases.feature, available: tabs)
        #expect(ContentView.tabTint(for: purchasesShown) == Color.popsPurchases)
        let inventoryShown = ContentView.shownFeature(
            chosen: FeatureInventory.feature, available: tabs)
        #expect(ContentView.tabTint(for: inventoryShown) == Color.popsInventory)
    }
}
