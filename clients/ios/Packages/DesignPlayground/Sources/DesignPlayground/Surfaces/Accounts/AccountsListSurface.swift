import AppCore
import FeatureAccounts

extension AccountsSurfaces {
    /// The accounts list, in every condition ``AccountsListState`` can put it
    /// in, plus the account-kind spread and the accessibility-size state where
    /// POPS-2900 lives.
    @MainActor internal static var listSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "accounts", slug: "list"),
            title: "Accounts",
            synopsis: "Every account, sectioned by whether the balance is yours or owed.",
            chrome: .navigationAndTabs,
            states: [
                DesignState.standard {
                    AccountsListView(model: listModel(outcome: .list(Fixtures.activeAccounts)))
                },
                DesignState("loading", "Loading") {
                    AccountsListView(model: listModel(outcome: .stalls))
                },
                DesignState("empty", "Empty") {
                    AccountsListView(model: listModel(outcome: .list([])))
                },
                DesignState("failed", "Finance unavailable") {
                    AccountsListView(model: listModel(outcome: .failure(.unavailable)))
                },
                DesignState("archived", "With archived") {
                    AccountsListView(
                        model: listModel(outcome: .list(Fixtures.allAccounts), showArchived: true)
                    )
                },
                DesignState("one", "Single account") {
                    AccountsListView(model: listModel(outcome: .list([Fixtures.everyday])))
                },
                // POPS-2900: pinned here, rather than left to the inspector's
                // type-size dial, so a reviewer sees the shipping defect by
                // opening the surface — this renders the real
                // `AccountsListView` at AX5, not a description of it.
                DesignState("ax5", "AX5 row collapse") {
                    AccountsListView(model: listModel(outcome: .list(Fixtures.activeAccounts)))
                        .dynamicTypeSize(.accessibility5)
                },
            ]
        )
    }

    @MainActor
    private static func listModel(
        outcome: AccountsOutcome,
        showArchived: Bool = false
    ) -> AccountsListViewModel {
        let model = AccountsListViewModel(
            dependencies: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: AppDependencies.unbound.receiptCapture,
                purchases: AppDependencies.unbound.purchases,
                accounts: PlaygroundAccountsRepository(outcome: outcome)
            ),
            router: Router()
        )
        model.showArchived = showArchived
        return model
    }
}
