/// One page of transactions and the cursor that follows it.
public struct TransactionPage: Hashable, Sendable {
    public let transactions: [Transaction]
    /// `nil` on the last page. An opaque token — the app must not derive it.
    public let nextCursor: String?

    public init(transactions: [Transaction], nextCursor: String?) {
        self.transactions = transactions
        self.nextCursor = nextCursor
    }
}

/// Reading transactions, as the feature that renders them sees it.
public protocol TransactionsRepository: Sendable {
    /// - Parameter cursor: `nil` for the first page, otherwise the
    ///   ``TransactionPage/nextCursor`` of the page before it. Cursors rather
    ///   than offsets because the underlying list mutates between requests, and
    ///   an offset into a mutating list silently duplicates and drops rows.
    func transactions(after cursor: String?) async throws -> TransactionPage

    /// The fuller record behind one row.
    ///
    /// - Returns: `nil` when finance no longer has it. A transaction deleted
    ///   between a list arriving and somebody tapping a row is an ordinary
    ///   outcome, so it is not thrown: an error is something a screen offers to
    ///   retry, and there is nothing here that retrying would find.
    func transactionDetail(id: Transaction.ID) async throws -> TransactionDetail?
}
