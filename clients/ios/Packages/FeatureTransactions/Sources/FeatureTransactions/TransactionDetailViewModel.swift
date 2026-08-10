import AppCore
import Observation

/// The detail screen's whole decision surface.
///
/// The view reads these and renders; it decides nothing. Same split as the
/// list, and for the same reason — "what does this screen do when the
/// transaction was deleted while somebody was looking at the list" is a test
/// rather than a thing to reproduce on a phone. No networking type appears
/// here either: this reads `AppCore`'s ``TransactionsRepository`` and has no
/// idea whether an HTTP call happened.
///
/// ## The screen opens on content, not on a spinner
///
/// The list already holds the row that was tapped, so this opens showing it and
/// fills in the rest underneath. A spinner drawn over data the app has had all
/// along is a screen that appears slower than it is, and — worse — makes the
/// reader wait to confirm they tapped the row they meant to.
///
/// The seed is not treated as an answer. The fetch still happens, because the
/// list row is a subset and may be minutes old; what the seed buys is that
/// nothing is *blank* while that runs.
@MainActor
@Observable
public final class TransactionDetailViewModel {
    /// What the screen shows.
    public private(set) var state: TransactionDetailState

    /// A fetch that failed while there was already something readable on
    /// screen.
    ///
    /// Reported beside that content rather than replacing it — the same
    /// decision the list makes about a failed refresh. The row the list handed
    /// over is true, and answering a failure by deleting it costs the reader
    /// what they had and tells them nothing they could not have been told
    /// beside it. Nil while there is nothing on screen, where the failure *is*
    /// the screen and ``TransactionDetailState/failed(_:)`` carries it instead.
    public private(set) var failure: RepositoryError?

    private let id: Transaction.ID
    private let repository: any TransactionsRepository

    /// Whether an answer — a record, or a definite absence — has landed. What
    /// stops ``load()`` refetching on every reappearance, and what makes it
    /// safe as the retry both failure treatments call.
    private var hasLoaded = false

    /// Re-entrancy protection. `.task` fires on appearance and the retry is a
    /// button; both can run before the first has answered.
    private var isLoading = false

    /// - Parameters:
    ///   - id: the transaction to fetch. The route carries this and nothing
    ///     else, so a restored route works whether or not a seed is available.
    ///   - seed: the row the list is already holding, when it has one. `nil` is
    ///     an ordinary case and not a fallback path — see the type's note.
    ///   - dependencies: read for ``TransactionsRepository`` and nothing else.
    public init(id: Transaction.ID, seed: Transaction?, dependencies: AppDependencies) {
        self.id = id
        repository = dependencies.transactions
        state = seed.map(TransactionDetailState.seeded) ?? .loading
    }
}

extension TransactionDetailViewModel {
    /// The fuller record.
    ///
    /// Safe to call on every appearance: it does nothing once an answer has
    /// landed, and retries when one never did — which is why both retries on
    /// this screen call this rather than a second entry point with the same
    /// guards to keep in step.
    ///
    /// ``failure`` is cleared *before* the request rather than only on success,
    /// and that is not tidiness. The view announces it to VoiceOver from an
    /// `onChange`, so a retry that fails the same way as the attempt before it
    /// would write an identical value, change nothing, and therefore say
    /// nothing — leaving somebody who cannot see the banner with a retry that
    /// produced silence. Clearing first makes every failure a `nil -> error`
    /// transition.
    public func load() async {
        guard !hasLoaded, !isLoading else { return }

        isLoading = true
        failure = nil
        defer { isLoading = false }

        do {
            let detail = try await repository.transactionDetail(id: id)
            hasLoaded = true
            // A definite absence is an answer, so `hasLoaded` is set for it
            // too. Retrying a deleted transaction asks a question that has
            // already been answered, on whatever connection the phone has.
            state = detail.map(TransactionDetailState.loaded) ?? .notFound
        } catch let error where error.isCancellation {
            return
        } catch {
            record(RepositoryError.describing(error))
        }
    }

    /// Where a failure goes depends on whether there is anything to lose.
    private func record(_ error: RepositoryError) {
        if state.hasContent {
            failure = error
        } else {
            state = .failed(error)
        }
    }
}
