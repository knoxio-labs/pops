import AppCore

/// A ``PurchasesRepository`` for the stage: a fixed page, a fixed failure, or
/// a call that never returns — never more than one of those at once.
///
/// Playground-local rather than `AppCoreFakes`' `InMemoryPurchasesRepository`
/// — see `Catalog`'s note on why nothing here may import that module.
internal struct PlaygroundPurchasesRepository: PurchasesRepository {
    let rows: [Purchase]
    let failure: RepositoryError?
    let hangs: Bool

    func purchases(after cursor: String?) async throws -> PurchasePage {
        if hangs {
            // Never answers, so the stage holds on the loading state. A
            // `Task.sleep` rather than a continuation nobody resumes, because
            // leaving the state cancels the task and the model treats that as
            // the non-event it is — the same shape `ReceiptCapturePreviews`
            // uses for the same reason.
            try await Task.sleep(for: .seconds(3_600))
        }
        if let failure {
            throw failure
        }
        return PurchasePage(purchases: rows, nextCursor: nil)
    }
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
        accounts: AppDependencies.unbound.accounts
    )
}
