import DesignSystem
import FeatureAccounts
import FeatureTransactions
import SwiftUI

/// The tabs a guest's phone has: the app's own tabs, in the app's own order,
/// less every feature a guest cannot open.
internal let guestShellTabs: [ShellTab] = shellTabs.filter { tab in
    tab.id == FeatureTransactions.feature.rawValue || tab.id == FeatureAccounts.feature.rawValue
}

/// Every entry across the accounts a guest holds, newest first. With more
/// than one account each row names its own.
internal struct GuestLedgerListView: View {
    internal let accounts: [GuestAccount]
    internal var offline = false

    @State private var adding = false

    private var entries: [GuestEntry] {
        accounts.flatMap(GuestFixtures.entries(for:)).sorted { $0.date > $1.date }
    }

    internal var body: some View {
        ScrollView {
            GuestEntryPanel(entries: entries, accounts: accounts, offline: offline)
                .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) {
            if offline { GuestOfflineBar() }
        }
        .toolbar {
            if accounts.contains(where: \.canEdit) {
                ToolbarItem(placement: .primaryAction) {
                    Button("Add an entry", systemImage: "plus") { adding = true }
                        .labelStyle(.iconOnly)
                        .disabled(offline)
                }
            }
        }
        .sheet(isPresented: $adding) {
            NavigationStack {
                GuestTransactionFormView(stage: GuestFormStage(accounts: accounts))
            }
        }
    }
}

/// The paired guest's whole app: two tabs, or no tab bar at all when nothing
/// is shared.
internal struct GuestShellView: View {
    internal let accounts: [GuestAccount]
    internal let offline: Bool

    @State private var selection: String

    internal init(accounts: [GuestAccount], opening: String? = nil, offline: Bool = false) {
        self.accounts = accounts
        self.offline = offline
        _selection = State(initialValue: opening ?? guestShellTabs.first?.id ?? "")
    }

    internal var body: some View {
        if accounts.isEmpty {
            GuestNothingSharedView(email: GuestFixtures.guestEmail)
        } else {
            TabView(selection: $selection) {
                ForEach(guestShellTabs) { tab in
                    NavigationStack {
                        page(for: tab)
                            .navigationTitle(tab.label)
                            .playgroundTitleDisplay(large: true)
                    }
                    .tabItem { Label(tab.label, systemImage: tab.symbol) }
                    .tag(tab.id)
                }
            }
        }
    }

    @ViewBuilder
    private func page(for tab: ShellTab) -> some View {
        if tab.id == FeatureAccounts.feature.rawValue {
            GuestAccountsListView(state: .loaded(accounts), offline: offline)
        } else {
            GuestLedgerListView(accounts: accounts, offline: offline)
        }
    }
}
