import AppCore
import DesignSystem
import SwiftUI

/// The purchases tab as the app would draw it: the home, the search the
/// platform gives a tab bar, and nothing else. The Receipts tab is gone,
/// folded into the home's capture control.
///
/// The search tab is `Tab(role: .search)`, which the system draws as its own
/// capsule beside the bar and expands into the room the bar gives up, so
/// nothing here places a search control by hand.
internal struct PurchasesShellView: View {
    internal let purchases: [Purchase]
    private let home: PurchasesHomePhase
    private let arriving: Purchase?
    private let list: PurchasesHomeList

    @State private var query: String
    @State private var searching: Bool
    @State private var selected: Int

    /// `home` defaults to `purchases`, loaded; `arriving` lands a moment
    /// after the tab opens, as a finished capture's save does.
    internal init(
        purchases: [Purchase],
        home: PurchasesHomePhase? = nil,
        arriving: Purchase? = nil,
        list: PurchasesHomeList = .recent,
        query: String = "",
        searching: Bool = false
    ) {
        self.purchases = purchases
        self.home = home ?? .loaded(purchases)
        self.arriving = arriving
        self.list = list
        _query = State(initialValue: query)
        _searching = State(initialValue: searching)
        // The search field lives on the search tab, so a state that pins it
        // open has to start on that tab. Defaulting to Purchases meant every
        // staged search state drew the Purchases tab instead — five states
        // that were pixel-identical to the standard one, which is how it was
        // noticed.
        _selected = State(initialValue: searching ? Self.searchTab : Self.purchasesTab)
    }

    private static let purchasesTab = 1
    private static let searchTab = 3

    internal var body: some View {
        TabView(selection: $selected) {
            Tab("Transactions", systemImage: "list.bullet", value: 0) {
                otherTab("Transactions")
            }
            Tab("Purchases", systemImage: "cart", value: Self.purchasesTab) {
                purchasesTab
            }
            Tab("Accounts", systemImage: "building.columns", value: 2) {
                otherTab("Accounts")
            }
            Tab(value: Self.searchTab, role: .search) {
                NavigationStack {
                    PurchasesSearchResults(purchases: purchases, query: query)
                        .navigationTitle("Search")
                        .playgroundTitleDisplay(large: false)
                }
                .playgroundSearchable(
                    text: $query,
                    isPresented: $searching,
                    prompt: "Merchants, items and tags"
                )
            }
        }
        .playgroundMinimizingTabBar()
        // The app tints the bar per feature, and only while that feature's
        // tab is the one selected.
        .tint(selected == Self.purchasesTab ? Color.popsPurchases : nil)
    }

    private var purchasesTab: some View {
        NavigationStack {
            PurchasesHomeView(phase: home, list: list, arriving: arriving)
                .navigationTitle("Purchases")
                .playgroundTitleDisplay(large: true)
        }
    }

    /// The other tabs hold a named placeholder rather than a second copy of a
    /// flow that has its own surface — the same rule ``ShellTabBarView``
    /// follows, and for the same reason.
    private func otherTab(_ name: String) -> some View {
        EmptyStateView(message: "\(name) fills the screen here. It has its own surface.")
    }
}
