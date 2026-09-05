import AppCore

/// One way a page fetch can answer, so a surface can pick whichever a state
/// needs: a page, an empty page, or a thrown error.
internal enum TransactionPageOutcome: Sendable {
    case page(TransactionPage)
    case failure(RepositoryError)
    /// Never answers, so a design state built on it holds still on whatever is
    /// already on screen. Cancellable rather than a continuation nobody
    /// resumes: the canvas going away cancels the `.task` that started the
    /// fetch, and the view model treats that as the non-event it is.
    case stalls
}

/// One way the detail fetch can answer.
///
/// Kept separate from ``TransactionPageOutcome`` because `nil` means something
/// different on each call. For a page it is simply an empty page — already
/// expressible as `.page(TransactionPage(transactions: [], nextCursor: nil))`.
/// For a detail it means finance no longer has the row, which is
/// ``detail(_:)`` with `nil` and is not the same screen as ``stalls``: one is
/// a definite absence, the other is a fetch still in flight over whatever the
/// list already handed the screen. See
/// `FeatureTransactions/TransactionsPreviews.swift`'s `detailNeverAnswers` for
/// the same distinction made on the feature's own canvases.
internal enum TransactionDetailOutcome: Sendable {
    case detail(TransactionDetail?)
    case failure(RepositoryError)
    case stalls
}

/// A ``TransactionsRepository`` built entirely from literals, for staging one
/// screen state at a time. Never reaches a network — everything it can say is
/// decided by the ``TransactionPageOutcome`` and ``TransactionDetailOutcome``
/// values it was configured with.
///
/// Pages are read off by index: the cursor scheme every page after the first
/// uses is `String(index)`, opaque exactly the way the real one is and never
/// derived from anything else. Asking past the configured pages answers with
/// an empty, exhausted page rather than failing, so a surface that only cares
/// about its first page or two does not have to enumerate the rest.
internal struct PlaygroundTransactionsRepository: TransactionsRepository {
    private let pages: [TransactionPageOutcome]
    private let detail: TransactionDetailOutcome

    internal init(
        pages: [TransactionPageOutcome] = [
            .page(TransactionPage(transactions: [], nextCursor: nil))
        ],
        detail: TransactionDetailOutcome = .detail(nil)
    ) {
        self.pages = pages
        self.detail = detail
    }

    internal func transactions(after cursor: String?) async throws -> TransactionPage {
        let index = cursor.flatMap(Int.init) ?? 0
        guard index < pages.count else {
            return TransactionPage(transactions: [], nextCursor: nil)
        }
        switch pages[index] {
        case .page(let page):
            return page
        case .failure(let error):
            throw error
        case .stalls:
            try await Task.sleep(for: .seconds(3600))
            return TransactionPage(transactions: [], nextCursor: nil)
        }
    }

    internal func transactionDetail(id: Transaction.ID) async throws -> TransactionDetail? {
        switch detail {
        case .detail(let record):
            return record
        case .failure(let error):
            throw error
        case .stalls:
            try await Task.sleep(for: .seconds(3600))
            return nil
        }
    }
}
