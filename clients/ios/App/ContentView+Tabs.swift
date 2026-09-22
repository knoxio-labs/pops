import AppCore
import FeatureAccounts
import FeatureInventory
import FeatureTransactions

extension ContentView {
    nonisolated internal static let moreTab = MobileFeature(rawValue: "shell.more")

    nonisolated internal static func primaryFeatures(for available: [MobileFeature])
        -> [MobileFeature]
    {
        available.filter { !moreFeatures(for: available).contains($0) }
    }

    nonisolated internal static func moreFeatures(for available: [MobileFeature]) -> [MobileFeature]
    {
        available.filter { $0 == FeatureAccounts.feature || $0 == FeatureTransactions.feature }
    }

    /// Groups secondary features into one tab so the native search bubble never overflows.
    nonisolated internal static func tabs(for available: [MobileFeature]) -> [MobileFeature] {
        var tabs = primaryFeatures(for: available)
        if !moreFeatures(for: available).isEmpty { tabs.append(moreTab) }
        if available.contains(FeatureInventory.feature) { tabs.append(inventorySearchTab) }
        return tabs
    }
}
