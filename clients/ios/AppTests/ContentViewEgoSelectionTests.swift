import AppCore
import FeaturePurchases
import Testing

@testable import Pops

@Suite("ContentView Ego selection")
@MainActor
internal struct ContentViewEgoSelectionTests {
    @Test("opening and dismissing Ego preserves the selected feature")
    func openingAndDismissingEgoPreservesSelectedFeature() {
        let purchases = FeaturePurchases.feature
        let inventory = MobileFeature(rawValue: "inventory")
        let ego = ContentView.egoLauncherTab
        var selection = ContentViewTabSelection()

        selection.select(purchases, egoLauncherTab: ego)
        selection.select(ego, egoLauncherTab: ego)

        #expect(
            selection.selectedTab(
                egoLauncherTab: ego, egoAvailable: true, available: [purchases, inventory]) == ego)

        selection.isEgoPresented = false

        #expect(
            selection.selectedTab(
                egoLauncherTab: ego, egoAvailable: true, available: [purchases, inventory])
                == purchases)
    }
}
