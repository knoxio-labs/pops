import AppCore

/// The whole history, and the unmatched part of it, as a pushed screen.
///
/// Staged at the page boundaries because that is where this screen has
/// decisions in it. The first page stops partway through August, so the
/// standard state shows the one month whose total is not yet a total.
@MainActor
internal enum PurchasesArchiveSurface {
    private static let firstPage = Array(PurchasesFixtures.history.prefix(9))

    static let surface = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "archive"),
        title: "All purchases",
        synopsis: "Every purchase by month, loading as it goes, and the unmatched alone.",
        chrome: .navigation,
        states: [
            DesignState.standard {
                PurchasesArchiveView(loaded: firstPage)
            },
            DesignState("everything", "Every page loaded") {
                PurchasesArchiveView(loaded: PurchasesFixtures.history, paging: .end)
            },
            // The one bottom drawn as an error. The rows already loaded stay:
            // a page that failed is not a reason to take away the ones that
            // did not.
            DesignState("page-failed", "A page failed to load") {
                PurchasesArchiveView(loaded: firstPage, paging: .failed)
            },
            // Where the digest's unmatched strip lands.
            DesignState("unmatched", "Only the unmatched") {
                PurchasesArchiveView(
                    loaded: PurchasesFixtures.history, paging: .end, scope: .unmatched)
            },
            DesignState("unmatched-none", "Nothing unmatched") {
                PurchasesArchiveView(
                    loaded: PurchasesFixtures.history.filter { !$0.status.isUnsettled },
                    paging: .end,
                    scope: .unmatched)
            },
        ]
    )
}
