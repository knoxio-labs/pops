import AppCore

/// A fixed purchases source for feature tests.
public actor InMemoryPurchasesRepository: PurchasesRepository {
    private let rows: [Purchase]

    public init(rows: [Purchase] = []) {
        self.rows = rows
    }

    public func purchases(after cursor: String?) async throws -> PurchasePage {
        guard cursor == nil else { throw RepositoryError.contractMismatch }
        return PurchasePage(purchases: rows, nextCursor: nil)
    }
}
