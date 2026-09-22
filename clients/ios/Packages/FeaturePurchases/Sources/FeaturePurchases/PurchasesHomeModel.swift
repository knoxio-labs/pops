import AppCore
import Foundation
import Observation

@MainActor @Observable
internal final class PurchasesHomeModel {
    internal private(set) var phase: PurchasesHomePhase = .loading
    internal private(set) var highlighted: Set<Purchase.ID> = []

    private let repository: any PurchasesRepository
    private let now: @MainActor @Sendable () -> Date
    private var generation = 0

    internal init(
        dependencies: AppDependencies,
        now: @escaping @MainActor @Sendable () -> Date = { .now }
    ) {
        repository = dependencies.purchases
        self.now = now
    }

    internal func load() async {
        let previous = phase
        phase = .loading
        await read(previous: previous, refreshFailure: nil)
    }

    internal func refresh() async {
        guard case .loaded(let digest, let refresh) = phase else { return }
        let previous = PurchasesHomePhase.loaded(digest, refresh: refresh)
        phase = .loaded(digest, refresh: .refreshing)
        await read(previous: previous, refreshFailure: digest)
    }

    internal func land(_ saved: [Purchase]) async {
        guard case .loaded(let digest, let refreshState) = phase else { return }
        highlighted.formUnion(saved.map(\.id))
        phase = .loaded(digest.landing(saved), refresh: refreshState)
        await refresh()
    }

    internal func land(savedIDs: [Purchase.ID]) async {
        guard case .loaded = phase else { return }
        highlighted.formUnion(savedIDs)
        await refresh()
    }

    private func read(previous: PurchasesHomePhase, refreshFailure digest: PurchasesHomeDigest?)
        async
    {
        generation += 1
        let requestGeneration = generation
        let month = now()
        do {
            async let pageRequest = repository.purchases(after: nil, statusFilter: .all)
            async let summaryRequest = repository.monthSummary(for: month)
            let (page, summary) = try await (pageRequest, summaryRequest)
            guard requestGeneration == generation else { return }
            guard let totalCount = page.totalCount else {
                throw RepositoryError.contractMismatch
            }
            let loaded = PurchasesHomeDigest(
                recent: page.purchases,
                allCount: totalCount,
                unmatched: page.purchases,
                month: month,
                summary: summary)
            phase = .loaded(loaded, refresh: .current)
        } catch let error where error is CancellationError || Task.isCancelled {
            guard requestGeneration == generation else { return }
            phase = previous
        } catch {
            guard requestGeneration == generation else { return }
            let failure = PurchasesHomeFailure(error)
            if let digest {
                phase = .loaded(
                    digest,
                    refresh: .failed(updated: PurchasesHomeCopy.time(now())))
            } else {
                phase = .failed(failure)
            }
        }
    }
}

internal enum PurchasesHomePhase {
    case loading
    case loaded(PurchasesHomeDigest, refresh: PurchasesHomeRefresh = .current)
    case failed(PurchasesHomeFailure)
}

internal enum PurchasesHomeRefresh: Equatable, Sendable {
    case current
    case refreshing
    case failed(updated: String)
}

internal enum PurchasesHomeFailure: String, CaseIterable, Identifiable, Sendable {
    case unavailable
    case unauthorized
    case contractMismatch
    case transport
    case dependencyNotBound

    internal init(_ error: Error) {
        switch error as? RepositoryError {
        case .unavailable: self = .unavailable
        case .unauthorized: self = .unauthorized
        case .contractMismatch: self = .contractMismatch
        case .transport: self = .transport
        case .dependencyNotBound: self = .dependencyNotBound
        case nil: self = .transport
        }
    }

    internal var id: String { rawValue }
}

internal enum PurchasesHomeFailureAction: Equatable, Sendable {
    case retry
    case pair
}

internal enum PurchasesHomeCopy {
    internal static func time(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}
