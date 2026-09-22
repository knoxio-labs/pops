import AppCore
import Foundation

@testable import FeaturePurchases

internal let homeFailureCases: [(RepositoryError, PurchasesHomeFailure)] = [
    (.unavailable, .unavailable),
    (.unauthorized, .unauthorized),
    (.contractMismatch, .contractMismatch),
    (.transport("offline"), .transport),
    (.dependencyNotBound, .dependencyNotBound),
]

internal enum HomeTestError: Error { case notLoaded }

@MainActor
internal final class HomeClock {
    var now: Date

    init(now: Date) { self.now = now }
}

internal struct FailingHomeRepository: PurchasesRepository {
    let error: RepositoryError

    func purchases(after: String?, statusFilter: PurchaseStatusFilter) async throws -> PurchasePage
    {
        throw error
    }

    func monthSummary(for: Date) async throws -> PurchasesMonthSummary { throw error }
}

internal struct CancellingHomeRepository: PurchasesRepository {
    func purchases(after: String?, statusFilter: PurchaseStatusFilter) async throws -> PurchasePage
    {
        throw CancellationError()
    }

    func monthSummary(for: Date) async throws -> PurchasesMonthSummary {
        throw CancellationError()
    }
}

internal actor MutableHomeRepository: PurchasesRepository {
    private let rows: [Purchase]
    private var failure: RepositoryError?
    private var callCount = 0

    init(rows: [Purchase]) { self.rows = rows }

    func setFailure(_ failure: RepositoryError?) { self.failure = failure }
    func calls() -> Int { callCount }

    func purchases(after: String?, statusFilter: PurchaseStatusFilter) async throws -> PurchasePage
    {
        callCount += 1
        if let failure { throw failure }
        return PurchasePage(purchases: rows, nextCursor: nil, totalCount: rows.count)
    }

    func monthSummary(for: Date) async throws -> PurchasesMonthSummary {
        callCount += 1
        if let failure { throw failure }
        return .empty
    }
}

internal actor HomeGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending {
            waiter.resume()
        }
    }
}

internal enum HomeResponse<Value: Sendable>: Sendable {
    case immediate(Value)
    case gated(HomeGate, Value)
    case cancelled

    func value() async throws -> Value {
        switch self {
        case .immediate(let value): return value
        case .gated(let gate, let value):
            await gate.wait()
            return value
        case .cancelled:
            throw CancellationError()
        }
    }
}

internal actor SequencedHomeRepository: PurchasesRepository {
    private let pages: [HomeResponse<PurchasePage>]
    private let summaries: [HomeResponse<PurchasesMonthSummary>]
    private var pageIndex = 0
    private var summaryIndex = 0
    private var callCount = 0
    private var callWaiters: [(Int, CheckedContinuation<Void, Never>)] = []

    init(
        pages: [HomeResponse<PurchasePage>],
        summaries: [HomeResponse<PurchasesMonthSummary>]
    ) {
        self.pages = pages
        self.summaries = summaries
    }

    func waitForCalls(_ count: Int) async {
        if callCount >= count { return }
        await withCheckedContinuation { callWaiters.append((count, $0)) }
    }

    func purchases(after: String?, statusFilter: PurchaseStatusFilter) async throws -> PurchasePage
    {
        let response = pages[pageIndex]
        pageIndex += 1
        recordedCall()
        return try await response.value()
    }

    func monthSummary(for: Date) async throws -> PurchasesMonthSummary {
        let response = summaries[summaryIndex]
        summaryIndex += 1
        recordedCall()
        return try await response.value()
    }

    private func recordedCall() {
        callCount += 1
        let ready = callWaiters.filter { callCount >= $0.0 }
        callWaiters.removeAll { callCount >= $0.0 }
        for waiter in ready {
            waiter.1.resume()
        }
    }
}
