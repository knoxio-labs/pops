import AppCore
import FeatureAccounts

extension AccountsSurfaces {
    /// One account's dashboard, in every condition ``AccountDetailState`` can
    /// put it in, plus the kind spread ``AccountFactsView`` switches on — a
    /// checking account, a card, a person ledger, a gift card, and the two
    /// undated accounts that reach `AccountPresentation.asOfNote(_:)`'s other
    /// two branches in `FeatureAccountsTests`.
    @MainActor internal static var detailSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "accounts", slug: "account"),
            title: "Account",
            synopsis:
                "One account: identity, the headline balance, and where the number came from.",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    AccountDetailView(
                        model: detailModel(seed: Fixtures.everyday, detail: .detail(Fixtures.everydayDetail))
                    )
                },
                DesignState("loading", "Loading") {
                    AccountDetailView(model: detailModel(seed: nil, detail: .stalls))
                },
                DesignState("seeded", "Seeded, still fetching") {
                    AccountDetailView(model: detailModel(seed: Fixtures.everyday, detail: .stalls))
                },
                DesignState("not-found", "No longer exists") {
                    AccountDetailView(model: detailModel(seed: nil, detail: .detail(nil)))
                },
                DesignState("failed", "Failed, nothing to show") {
                    AccountDetailView(model: detailModel(seed: nil, detail: .failure(.unauthorized)))
                },
                DesignState("failed-over-seed", "Failed, seeded row kept") {
                    AccountDetailView(
                        model: detailModel(
                            seed: Fixtures.everyday,
                            detail: .failure(.transport("host unreachable"))
                        )
                    )
                },
                DesignState("liability", "Liability") {
                    AccountDetailView(
                        model: detailModel(seed: Fixtures.amex, detail: .detail(Fixtures.amexDetail))
                    )
                },
                DesignState("person", "Person ledger") {
                    AccountDetailView(
                        model: detailModel(seed: Fixtures.marta, detail: .detail(Fixtures.martaDetail))
                    )
                },
                DesignState("stored-value", "Gift card") {
                    AccountDetailView(
                        model: detailModel(
                            seed: Fixtures.giftCard, detail: .detail(Fixtures.giftCardDetail))
                    )
                },
                DesignState("never-checked", "Never checked") {
                    AccountDetailView(
                        model: detailModel(
                            seed: Fixtures.unchecked, detail: .detail(Fixtures.uncheckedDetail))
                    )
                },
                DesignState("never-counted", "Never counted") {
                    AccountDetailView(
                        model: detailModel(seed: Fixtures.euros, detail: .detail(Fixtures.eurosDetail))
                    )
                },
                DesignState("long-name", "Name that truncates") {
                    AccountDetailView(
                        model: detailModel(
                            seed: Fixtures.mortgage, detail: .detail(Fixtures.mortgageDetail))
                    )
                },
            ]
        )
    }

    @MainActor
    private static func detailModel(
        seed: Account?,
        detail: AccountDetailOutcome
    ) -> AccountDetailViewModel {
        AccountDetailViewModel(
            id: Fixtures.everyday.id,
            seed: seed,
            dependencies: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: AppDependencies.unbound.receiptCapture,
                purchases: AppDependencies.unbound.purchases,
                accounts: PlaygroundAccountsRepository(detail: detail)
            )
        )
    }
}
