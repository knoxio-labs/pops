/// One tab in the shell's own composition — not a `MobileFeature`, because
/// one of the four is not one: `accounts` has no `MobileFeature` constant at
/// all, and nothing here should invent one just to draw a preview.
internal struct ShellTab: Identifiable, Sendable {
    let id: String
    let label: String
    let symbol: String
}

/// The tab bar's real composition, in the app's own order.
///
/// The first three are `RootFeature.renderable`, with the labels and symbols
/// `RootCopy.name(of:)`/`symbol(for:)` actually produce today — which is why
/// `purchases` reads lower-case under a generic glyph rather than "Purchases"
/// under something purpose-drawn: those functions special-case only
/// Transactions and Receipts (POPS-2893), and this mirrors what a paired
/// phone draws rather than what it should draw. `Accounts` is last and
/// different in kind from the rest: `FeatureAccounts` is built and reachable
/// from this package, but is not on `RootFeature.renderable` because BFM has
/// no `/mobile` accounts route to bootstrap against, so no live phone offers
/// this tab yet.
internal let shellTabs: [ShellTab] = [
    ShellTab(id: "transactions", label: "Transactions", symbol: "list.bullet.rectangle"),
    ShellTab(id: "purchases", label: "purchases", symbol: "square.grid.2x2"),
    ShellTab(id: "receipt-capture", label: "Receipts", symbol: "doc.text.viewfinder"),
    ShellTab(id: "accounts", label: "Accounts", symbol: "wallet.pass"),
]
