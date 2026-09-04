import AppCore
import Observation

/// The account dashboard's whole decision surface — the same split
/// `TransactionDetailViewModel` draws, adapted to one repository call instead
/// of two: ``AccountDetail`` already carries the history, the kind's facts and
/// the recent transactions together, so there is one fetch to retry rather
/// than a seed plus a separate detail call.
@MainActor
@Observable
public final class AccountDetailViewModel {
    public private(set) var state: AccountDetailState

    /// A fetch that failed while there was already something readable on
    /// screen — reported beside it, not replacing it.
    public private(set) var failure: RepositoryError?

    private let id: Account.ID
    private let repository: any AccountsRepository

    private var hasLoaded = false
    private var isLoading = false

    /// - Parameters:
    ///   - id: the account to fetch.
    ///   - seed: the row the list is already holding, when it has one.
    ///   - dependencies: read for ``AccountsRepository`` and nothing else.
    public init(id: Account.ID, seed: Account?, dependencies: AppDependencies) {
        self.id = id
        repository = dependencies.accounts
        state = seed.map(AccountDetailState.seeded) ?? .loading
    }
}

extension AccountDetailViewModel {
    /// Safe to call on every appearance: it does nothing once an answer has
    /// landed, and retries when one never did.
    public func load() async {
        guard !hasLoaded, !isLoading else { return }

        isLoading = true
        failure = nil
        defer { isLoading = false }

        do {
            let detail = try await repository.accountDetail(id: id)
            hasLoaded = true
            state = detail.map(AccountDetailState.loaded) ?? .notFound
        } catch let error where error.isCancellation {
            return
        } catch {
            record(RepositoryError.describing(error))
        }
    }

    private func record(_ error: RepositoryError) {
        if state.hasContent {
            failure = error
        } else {
            state = .failed(error)
        }
    }
}
