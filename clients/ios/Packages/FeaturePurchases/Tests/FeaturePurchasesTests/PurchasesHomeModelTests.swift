import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases home model")
@MainActor
internal struct PurchasesHomeModelTests {
    @Test("zero rows load an empty digest")
    func loadsEmptyDigest() async throws {
        let model = PurchasesHomeModel(
            dependencies: .fake(purchases: InMemoryPurchasesRepository()))

        await model.load()

        let digest = try loaded(model.phase)
        #expect(digest.purchases.isEmpty)
        #expect(digest.allCount == 0)
        #expect(digest.monthCount == 0)
    }

    @Test("cancellation leaves the existing phase unchanged")
    func cancellationLeavesPhaseUnchanged() async {
        let model = PurchasesHomeModel(
            dependencies: .fake(purchases: CancellingHomeRepository()))

        await model.load()

        guard case .loading = model.phase else {
            Issue.record("Cancellation changed the initial phase")
            return
        }
    }

    @Test("repository failures remain distinct", arguments: homeFailureCases)
    func mapsFailure(error: RepositoryError, expected: PurchasesHomeFailure) async {
        let model = PurchasesHomeModel(
            dependencies: .fake(purchases: FailingHomeRepository(error: error)))

        await model.load()

        guard case .failed(let failure) = model.phase else {
            Issue.record("Expected a failed phase")
            return
        }
        #expect(failure == expected)
    }

    @Test("a refresh failure keeps the last digest")
    func refreshFailureKeepsDigest() async throws {
        let repository = MutableHomeRepository(rows: [.fake(id: "kept")])
        let model = PurchasesHomeModel(dependencies: .fake(purchases: repository))
        await model.load()
        await repository.setFailure(.unavailable)

        await model.refresh()

        guard case .loaded(let digest, .failed) = model.phase else {
            Issue.record("Expected loaded content with a failed refresh")
            return
        }
        #expect(digest.purchases.map(\.id) == ["kept"])
    }

    @Test("landing rows highlights every saved ID and performs one refresh")
    func landsRowsAndRefreshesOnce() async throws {
        let repository = MutableHomeRepository(rows: [.fake(id: "existing")])
        let model = PurchasesHomeModel(dependencies: .fake(purchases: repository))
        await model.load()
        let callsBeforeLanding = await repository.calls()
        let saved = [Purchase.fake(id: "saved-1"), .fake(id: "saved-2")]

        await model.land(saved)

        #expect(model.highlighted == ["saved-1", "saved-2"])
        #expect(await repository.calls() == callsBeforeLanding + 2)
    }

    @Test("landing IDs highlights them without inventing rows and performs one refresh")
    func landsIDsAndRefreshesOnce() async throws {
        let repository = MutableHomeRepository(rows: [.fake(id: "server-row")])
        let model = PurchasesHomeModel(dependencies: .fake(purchases: repository))
        await model.load()
        let callsBeforeLanding = await repository.calls()

        await model.land(savedIDs: ["saved-1", "saved-2"])

        let digest = try loaded(model.phase)
        #expect(model.highlighted == ["saved-1", "saved-2"])
        #expect(digest.purchases.map(\.id) == ["server-row"])
        #expect(await repository.calls() == callsBeforeLanding + 2)
    }

    @Test("a stale refresh cannot replace a newer refresh")
    func staleRefreshIsDiscarded() async throws {
        let oldGate = HomeGate()
        let initial = Purchase.fake(id: "initial")
        let old = Purchase.fake(id: "old")
        let newest = Purchase.fake(id: "newest")
        let repository = SequencedHomeRepository(
            pages: [
                .immediate(page([initial])), .gated(oldGate, page([old])),
                .immediate(page([newest])),
            ],
            summaries: [
                .immediate(.empty), .gated(oldGate, .empty), .immediate(.empty),
            ])
        let model = PurchasesHomeModel(dependencies: .fake(purchases: repository))
        await model.load()

        let stale = Task { await model.refresh() }
        await repository.waitForCalls(4)
        let latest = Task { await model.refresh() }
        await repository.waitForCalls(6)
        await latest.value
        await oldGate.open()
        await stale.value

        let digest = try loaded(model.phase)
        #expect(digest.purchases.map(\.id) == ["newest"])
    }

    @Test("summary facts drive the digest instead of the loaded page")
    func summaryDrivesDigest() async throws {
        let summary = PurchasesMonthSummary(
            totals: [.init(total: money(9_000), netSpend: money(8_000), orderCount: 7)],
            purchaseCount: 19,
            previousMonthTotals: nil,
            unmatchedCount: 11,
            merchantLeaders: [
                .init(merchantName: "Leader", netSpend: money(7_000), orderCount: 6)
            ])
        let repository = InMemoryPurchasesRepository(
            rows: [.fake(id: "only-page-row")], summary: summary)
        let model = PurchasesHomeModel(dependencies: .fake(purchases: repository))

        await model.load()

        let digest = try loaded(model.phase)
        #expect(digest.allCount == 1)
        #expect(digest.monthCount == 19)
        #expect(digest.unmatchedCount == 11)
        #expect(digest.totals == [money(9_000)])
        #expect(digest.leaders.map(\.name) == ["Leader"])
    }

    private func loaded(_ phase: PurchasesHomePhase) throws -> PurchasesHomeDigest {
        guard case .loaded(let digest, .current) = phase else {
            throw HomeTestError.notLoaded
        }
        return digest
    }

    private func page(_ rows: [Purchase]) -> PurchasePage {
        PurchasePage(purchases: rows, nextCursor: nil, totalCount: rows.count)
    }

    private func money(_ minorUnits: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD")
    }
}

private let homeFailureCases: [(RepositoryError, PurchasesHomeFailure)] = [
    (.unavailable, .unavailable),
    (.unauthorized, .unauthorized),
    (.contractMismatch, .contractMismatch),
    (.transport("offline"), .transport),
    (.dependencyNotBound, .dependencyNotBound),
]

private enum HomeTestError: Error { case notLoaded }

private struct FailingHomeRepository: PurchasesRepository {
    let error: RepositoryError

    func purchases(after: String?, statusFilter: PurchaseStatusFilter) async throws -> PurchasePage
    {
        throw error
    }

    func monthSummary(for: Date) async throws -> PurchasesMonthSummary { throw error }
}

private struct CancellingHomeRepository: PurchasesRepository {
    func purchases(after: String?, statusFilter: PurchaseStatusFilter) async throws -> PurchasePage
    {
        throw CancellationError()
    }

    func monthSummary(for: Date) async throws -> PurchasesMonthSummary {
        throw CancellationError()
    }
}

private actor MutableHomeRepository: PurchasesRepository {
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

private actor HomeGate {
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

private enum HomeResponse<Value: Sendable>: Sendable {
    case immediate(Value)
    case gated(HomeGate, Value)

    func value() async -> Value {
        switch self {
        case .immediate(let value): return value
        case .gated(let gate, let value):
            await gate.wait()
            return value
        }
    }
}

private actor SequencedHomeRepository: PurchasesRepository {
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
        return await response.value()
    }

    func monthSummary(for: Date) async throws -> PurchasesMonthSummary {
        let response = summaries[summaryIndex]
        summaryIndex += 1
        recordedCall()
        return await response.value()
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
