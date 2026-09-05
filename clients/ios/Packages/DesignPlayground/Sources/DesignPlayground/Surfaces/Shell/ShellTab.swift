import FeatureAccounts
import FeaturePurchases
import FeatureReceiptCapture
import FeatureTransactions

/// One tab in the shell's own composition — not a `MobileFeature`, because the
/// tab bar is a list of things to draw rather than a list of things the BFM
/// offered, and `accounts` is on it without any live phone offering it.
internal struct ShellTab: Identifiable, Sendable {
    let id: String
    let label: String
    let symbol: String
}

/// The tab bar's real composition, in the app's own order.
///
/// The first three are `RootFeature.renderable`. Their labels and glyphs are
/// read from the feature modules that declare them — the same constants
/// `RootFeature.presentation` hands to `RootCopy.name(of:)`/`symbol(for:)`
/// (POPS-2893) — rather than restated as literals here. A restatement is a
/// second copy of the answer, and this file held a stale one for as long as it
/// took someone to notice (POPS-2976). `Accounts` is last and different in
/// kind from the rest: `FeatureAccounts` is built and reachable from this
/// package, but is not on `RootFeature.renderable` because BFM has no
/// `/mobile` accounts route to bootstrap against, so no live phone offers this
/// tab yet.
internal let shellTabs: [ShellTab] = [
    ShellTab(
        id: FeatureTransactions.feature.rawValue,
        label: FeatureTransactions.displayName,
        symbol: FeatureTransactions.symbolName
    ),
    ShellTab(
        id: FeaturePurchases.feature.rawValue,
        label: FeaturePurchases.displayName,
        symbol: FeaturePurchases.symbolName
    ),
    ShellTab(
        id: FeatureReceiptCapture.feature.rawValue,
        label: FeatureReceiptCapture.displayName,
        symbol: FeatureReceiptCapture.symbolName
    ),
    ShellTab(
        id: FeatureAccounts.feature.rawValue,
        label: FeatureAccounts.displayName,
        symbol: FeatureAccounts.symbolName
    ),
]
