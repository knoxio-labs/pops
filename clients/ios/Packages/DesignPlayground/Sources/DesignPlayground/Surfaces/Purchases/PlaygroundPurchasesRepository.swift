import AppCore
import Foundation

/// A ``PurchasesRepository`` for the stage: a fixed page, a fixed failure, or
/// a call that never returns — never more than one of those at once.
///
/// Playground-local rather than `AppCoreFakes`' `InMemoryPurchasesRepository`
/// — see `Catalog`'s note on why nothing here may import that module.
internal struct PlaygroundPurchasesRepository: PurchasesRepository {
    let rows: [Purchase]
    let failure: RepositoryError?
    let hangs: Bool

    func search(
        text: String, status: AppCore.PurchaseSearchStatus
    ) async throws -> [AppCore.PurchaseSearchHit] {
        []
    }

    func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        if hangs {
            // Never answers, so the stage holds on the loading state. A
            // `Task.sleep` rather than a continuation nobody resumes, because
            // leaving the state cancels the task and the model treats that as
            // the non-event it is — the same shape this package's other
            // playground repositories use for the same reason.
            try await Task.sleep(for: .seconds(3_600))
        }
        if let failure {
            throw failure
        }
        return PurchasePage(purchases: rows, nextCursor: nil, totalCount: rows.count)
    }

    func monthSummary(for month: Date) async throws -> PurchasesMonthSummary {
        if let failure {
            throw failure
        }
        return .empty
    }

    func purchaseDetail(id: Purchase.ID) async throws -> AppCore.PurchaseDetail? { nil }

    func updatePurchase(
        id: Purchase.ID, _ update: PurchaseUpdate
    ) async throws -> AppCore.PurchaseDetail? { nil }

    func receiptThumbnail(sha256: String) async throws -> AppCore.ReceiptImage? { nil }

    func receiptImage(sha256: String) async throws -> AppCore.ReceiptImage? { nil }
}

/// Builds an ``AppDependencies`` around one ``PurchasesRepository`` shape,
/// with every other seam left ``AppDependencies/unbound`` — the surfaces
/// built from this never call them, and the public initialiser is the route
/// that keeps this file clear of `AppCoreFakes`.
internal func playgroundPurchasesDependencies(
    rows: [Purchase] = [],
    failure: RepositoryError? = nil,
    hangs: Bool = false
) -> AppDependencies {
    AppDependencies(
        transactions: AppDependencies.unbound.transactions,
        pairing: AppDependencies.unbound.pairing,
        reachability: AppDependencies.unbound.reachability,
        receiptCapture: AppDependencies.unbound.receiptCapture,
        purchases: PlaygroundPurchasesRepository(rows: rows, failure: failure, hangs: hangs),
        merchants: AppDependencies.unbound.merchants,
        accounts: AppDependencies.unbound.accounts
    )
}
