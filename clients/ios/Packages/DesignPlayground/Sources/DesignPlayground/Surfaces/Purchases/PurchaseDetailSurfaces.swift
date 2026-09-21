import AppCore
import Foundation

/// A saved purchase: its content in the conditions the archive holds, every
/// way the fetch can go, and editing it.
@MainActor
internal enum PurchaseDetailSurfaces {
    private typealias Fixture = PurchaseDetailFixtures

    /// Any row of the history as a detail, so a row opened from the archive
    /// lands somewhere. No lines: the fixtures itemise only the purchases
    /// staged here, and an invented line would be a claim about a purchase
    /// nobody made.
    internal static func sample(for purchase: Purchase) -> PurchaseDetail {
        let none = MoneyAmount(minorUnits: 0, currencyCode: purchase.total.currencyCode)
        let pages = purchase.receiptURI == nil ? [] : [Fixture.page(0)]
        return PurchaseDetail(
            purchase: purchase, subtotal: purchase.total, tax: none, shipping: none,
            discount: none, surcharge: none,
            source: purchase.receiptURI ?? "pops://purchases/manual",
            lines: [], pages: pages)
    }

    private static func state(
        _ id: String, _ title: String, _ phase: PurchaseDetailPhase,
        _ stage: PurchaseDetailStage = PurchaseDetailStage()
    ) -> DesignState {
        DesignState(id, title) { PurchaseDetailSurface(phase: phase, stage: stage) }
    }

    private static func loaded(_ detail: PurchaseDetail) -> PurchaseDetailPhase {
        .loaded(detail, refresh: nil)
    }

    private static func failed(_ failure: PurchaseDetailFailure) -> PurchaseDetailPhase {
        .failed(failure)
    }

    private static let retryLands = PurchaseDetailStage(afterRetry: Fixture.bunnings)

    private static let content: [DesignState] = [
        state("default", "Awaiting a bank match", loaded(Fixture.bunnings)),
        state("matched", "Matched to the bank", loaded(Fixture.aldi)),
        state("till-names", "Lines as the till printed them", loaded(Fixture.salvos)),
        state("every-figure", "Tax, delivery, discount and surcharge", loaded(Fixture.uniqlo)),
        state("no-lines", "A receipt with no itemised lines", loaded(Fixture.sushiNoLines)),
        state("unattributed", "No merchant was recognised", loaded(Fixture.unattributed)),
        state("cash", "Settled in cash, no receipt", loaded(Fixture.cash)),
        state("foreign", "Priced in another currency", loaded(Fixture.foreign)),
    ]

    private static let fetching: [DesignState] = [
        state("loading", "Loading", .loading),
        state("offline", "Offline, nothing saved", failed(.offline), retryLands),
        state("unreachable", "Purchases didn't answer", failed(.unreachable), retryLands),
        state("not-found", "Purchase not found", failed(.notFound)),
        state("unauthorized", "No access to purchases", failed(.unauthorized)),
        state("contract-mismatch", "Contract mismatch", failed(.contractMismatch)),
        state(
            "refresh-offline", "Refresh while offline",
            .loaded(Fixture.bunnings, refresh: .offline)),
        state(
            "refresh-failed", "Refresh failed, purchase kept",
            .loaded(Fixture.bunnings, refresh: .unreachable)),
    ]

    private static func editing(_ edit: PurchaseEditStage, after: PurchaseDetail)
        -> PurchaseDetailStage
    {
        PurchaseDetailStage(edit: edit, afterSave: after)
    }

    private static let editJourney: [DesignState] = [
        state(
            "edit", "Edit, awaiting a match", loaded(Fixture.bunnings),
            editing(.open, after: Fixture.bunningsEdited)),
        state(
            "edit-matched", "Edit, matched to the bank", loaded(Fixture.aldi),
            editing(.open, after: Fixture.aldiEdited)),
        state(
            "edit-discard", "Cancel with unsaved changes", loaded(Fixture.bunnings),
            editing(.confirmingDiscard, after: Fixture.bunningsEdited)),
        state(
            "edit-saving", "Saving", loaded(Fixture.bunnings),
            editing(.saving, after: Fixture.bunningsEdited)),
        state(
            "edit-failed", "Save failed, changes kept", loaded(Fixture.bunnings),
            editing(.failed, after: Fixture.bunningsEdited)),
        state("edited", "Saved, marked edited", loaded(Fixture.bunningsEdited)),
        state(
            "edited-original", "The original reading", loaded(Fixture.bunningsEdited),
            PurchaseDetailStage(showsOriginal: true)),
    ]

    internal static let surface = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "detail"),
        title: "Purchase",
        synopsis:
            "A saved purchase, its receipt and lines, every way loading it can go, and editing it.",
        chrome: .navigation,
        states: content + fetching + editJourney
    )
}
