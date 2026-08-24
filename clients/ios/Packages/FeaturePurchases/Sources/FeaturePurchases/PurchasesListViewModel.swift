import AppCore
import Observation

/// The state and loading policy for the purchase history.
@MainActor @Observable
public final class PurchasesListViewModel {
    public private(set) var purchases: [Purchase] = []
    public private(set) var failure: RepositoryError?
    public private(set) var isLoading = true

    private let repository: any PurchasesRepository
    private let reachability: any ReachabilityWitness
    private var didLoad = false

    public init(dependencies: AppDependencies) {
        repository = dependencies.purchases
        reachability = dependencies.reachability
    }

    public func load(force: Bool = false) async {
        guard force || !didLoad else { return }
        isLoading = true
        failure = nil
        do {
            let page = try await repository.purchases(after: nil)
            purchases = page.purchases
            didLoad = true
            await reachability.noteReachable()
        } catch let error where Task.isCancelled || error is CancellationError {
            return
        } catch {
            failure = error as? RepositoryError ?? .transport(String(describing: error))
        }
        isLoading = false
    }
}
