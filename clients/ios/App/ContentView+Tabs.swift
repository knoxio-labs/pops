import AppCore
import FeatureAccounts
import FeatureEgo
import FeatureTransactions

extension ContentView {
    nonisolated internal static let moreTab = MobileFeature(rawValue: "shell.more")
    nonisolated internal static let moreTabAccessibilityIdentifier = "more-tab"

    nonisolated internal static func tabFeatures(for available: [MobileFeature])
        -> [MobileFeature]
    {
        available.filter { $0 != FeatureEgo.feature }
    }

    nonisolated internal static func showsEgoEntry(available: [MobileFeature]) -> Bool {
        available.contains(FeatureEgo.feature)
    }

    nonisolated internal static func primaryFeatures(for available: [MobileFeature])
        -> [MobileFeature]
    {
        let tabFeatures = tabFeatures(for: available)
        return tabFeatures.filter { !moreFeatures(for: tabFeatures).contains($0) }
    }

    nonisolated internal static func moreFeatures(for available: [MobileFeature])
        -> [MobileFeature]
    {
        tabFeatures(for: available).filter {
            $0 == FeatureAccounts.feature || $0 == FeatureTransactions.feature
        }
    }

    /// Groups secondary features into one tab so the native search bubble never overflows.
    nonisolated internal static func tabs(for available: [MobileFeature]) -> [MobileFeature] {
        let tabFeatures = tabFeatures(for: available)
        var tabs = primaryFeatures(for: tabFeatures)
        if !moreFeatures(for: tabFeatures).isEmpty { tabs.append(moreTab) }
        if SearchPillar.allCases.contains(where: { tabFeatures.contains($0.feature) }) {
            tabs.append(searchTab)
        }
        return tabs
    }
}
