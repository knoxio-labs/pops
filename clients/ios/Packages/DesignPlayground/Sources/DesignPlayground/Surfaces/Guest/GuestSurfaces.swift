import FeatureAccounts
import FeaturePairing

/// Every surface a guest sees: someone the operator shared specific accounts
/// with, signed in on their own phone.
///
/// These are drawn here rather than staged from `FeatureAccounts` and
/// `FeatureTransactions` because the app has no guest wording, no entry form
/// and no receipt strip to stage. Where the app already has the view, the
/// unpaired screen and the degradation banner, that view is what appears.
@MainActor
internal enum GuestSurfaces {
    internal static let surfaces: [DesignSurface] = [
        shellSurface, accountsSurface, accountSurface, transactionSurface, formSurface,
        receiptSurface, historySurface, activitySurface,
    ]

    internal static var shellSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "shell"),
            title: "Guest app",
            synopsis: "What a guest's phone opens into: two tabs, and what replaces them.",
            chrome: .bare,
            states: [
                DesignState.standard {
                    GuestShellView(accounts: GuestFixtures.accounts)
                },
                DesignState("accounts", "Accounts tab") {
                    GuestShellView(
                        accounts: GuestFixtures.accounts,
                        opening: FeatureAccounts.feature.rawValue)
                },
                DesignState("nothing-shared", "No accounts granted") {
                    GuestShellView(accounts: [])
                },
                DesignState("offline", "Offline, last loaded kept") {
                    GuestShellView(accounts: GuestFixtures.accounts, offline: true)
                },
                DesignState("unpaired", "Phone unpaired by the operator") {
                    PairingView(
                        model: PairingSurfaceFactory.model(),
                        returningBecause: .revokedByOperator)
                },
            ]
        )
    }

    internal static var accountsSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "accounts"),
            title: "Accounts",
            synopsis: "The accounts shared with a guest, each balance in the guest's own terms.",
            chrome: .navigationLarge,
            states: [
                DesignState.standard {
                    GuestAccountsListView(state: .loaded(GuestFixtures.accounts))
                },
                DesignState("one", "One account") {
                    GuestAccountsListView(state: .loaded([GuestFixtures.ledger]))
                },
                DesignState("owed-to-you", "They owe you") {
                    GuestAccountsListView(state: .loaded([GuestFixtures.ledgerOwedToGuest]))
                },
                DesignState("settled", "Settled up") {
                    GuestAccountsListView(state: .loaded([GuestFixtures.ledgerSettled]))
                },
                DesignState("loading", "Loading") {
                    GuestAccountsListView(state: .loading)
                },
                DesignState("nothing-shared", "No accounts granted") {
                    GuestAccountsListView(
                        state: .nothingShared(email: GuestFixtures.guestEmail))
                },
                DesignState("offline", "Offline, last loaded kept") {
                    GuestAccountsListView(state: .loaded(GuestFixtures.accounts), offline: true)
                },
                DesignState("failed", "Could not load") {
                    GuestAccountsListView(state: .failed)
                },
            ]
        )
    }

    internal static var accountSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "account"),
            title: "Account",
            synopsis: "One shared account at the edit and view roles, and when access ends.",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    GuestAccountDetailView(
                        account: GuestFixtures.ledger,
                        entries: .loaded(GuestFixtures.ledgerEntries))
                },
                DesignState("view-only", "View role") {
                    GuestAccountDetailView(
                        account: GuestFixtures.ledgerViewOnly,
                        entries: .loaded(GuestFixtures.ledgerEntries))
                },
                DesignState("owed-to-you", "They owe you") {
                    GuestAccountDetailView(
                        account: GuestFixtures.ledgerOwedToGuest,
                        entries: .loaded(Array(GuestFixtures.ledgerEntries.prefix(4))))
                },
                DesignState("settled", "Settled up, no entries") {
                    GuestAccountDetailView(
                        account: GuestFixtures.ledgerSettled, entries: .loaded([]))
                },
                DesignState("shared-account", "An ordinary account, view role") {
                    GuestAccountDetailView(
                        account: GuestFixtures.household,
                        entries: .loaded(GuestFixtures.householdEntries))
                },
                DesignState("loading", "Entries loading") {
                    GuestAccountDetailView(account: GuestFixtures.ledger, entries: .loading)
                },
                DesignState("offline", "Offline, adding held") {
                    GuestAccountDetailView(
                        account: GuestFixtures.ledger,
                        entries: .loaded(GuestFixtures.ledgerEntries), offline: true)
                },
                DesignState("revoked", "Access revoked mid-session") {
                    GuestAccountDetailView(
                        account: GuestFixtures.ledger,
                        entries: .loaded(GuestFixtures.ledgerEntries), revoked: true)
                },
            ]
        )
    }
}
