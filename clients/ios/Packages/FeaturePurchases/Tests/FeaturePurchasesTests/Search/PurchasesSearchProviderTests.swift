import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases universal search provider")
internal struct PurchasesSearchProviderTests {
    @Test("offline yields .offline and sends nothing to the repository")
    internal func offline() async throws {
        let repository = InMemoryPurchasesRepository(hits: [Self.purchaseHit])
        let reachability = ScriptedNetworkReachability(satisfied: false)
        var events = PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter())
            .makeAsyncIterator()

        #expect(Self.isOffline(await events.next()))
        #expect(await repository.searchCalls.isEmpty)
    }

    @Test("coming back online searches once and yields results")
    internal func backOnline() async throws {
        let repository = InMemoryPurchasesRepository(hits: [Self.purchaseHit])
        let reachability = ScriptedNetworkReachability(satisfied: false)
        var events = PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter())
            .makeAsyncIterator()
        #expect(Self.isOffline(await events.next()))

        reachability.set(true)
        let results = try #require(Self.results(await events.next()))

        #expect(results == [Self.purchaseHit])
        #expect(await repository.searchCalls.count == 1)
        #expect(await repository.searchCalls.first?.text == "bunnings")
    }

    @Test("kind filters purchase hits from line hits on the phone")
    internal func kindFiltersPurchases() async throws {
        let repository = InMemoryPurchasesRepository(hits: [Self.purchaseHit, Self.lineHit])
        let reachability = ScriptedNetworkReachability(satisfied: true)
        var events = PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter(kind: .purchases))
            .makeAsyncIterator()

        let results = try #require(Self.results(await events.next()))

        #expect(results == [Self.purchaseHit])
    }

    @Test("kind filters line hits from purchase hits on the phone")
    internal func kindFiltersLines() async throws {
        let repository = InMemoryPurchasesRepository(hits: [Self.purchaseHit, Self.lineHit])
        let reachability = ScriptedNetworkReachability(satisfied: true)
        var events = PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter(kind: .lines))
            .makeAsyncIterator()

        let results = try #require(Self.results(await events.next()))

        #expect(results == [Self.lineHit])
    }

    @Test("status is sent to the repository")
    internal func statusReachesRepository() async throws {
        let repository = InMemoryPurchasesRepository(hits: [Self.purchaseHit])
        let reachability = ScriptedNetworkReachability(satisfied: true)
        var events = PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter(status: .matched))
            .makeAsyncIterator()

        _ = await events.next()

        #expect(await repository.searchCalls.first?.status == .matched)
    }

    @Test("a transport failure yields .failed")
    internal func transportFailure() async throws {
        let repository = InMemoryPurchasesRepository(hits: [Self.purchaseHit])
        await repository.fail(onCall: 1, with: .transport("boom"))
        let reachability = ScriptedNetworkReachability(satisfied: true)
        var events = PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter())
            .makeAsyncIterator()

        #expect(Self.isFailed(await events.next()))
        #expect(await events.next() == nil)
    }

    @Test("a cancellation finishes the stream with no events")
    internal func cancellationIsSilent() async throws {
        let repository = InMemoryPurchasesRepository(
            hits: [Self.purchaseHit], searchDelay: .milliseconds(200))
        let reachability = ScriptedNetworkReachability(satisfied: true)
        let stream = PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter())

        let task = Task<[SearchProviderEvent<PurchaseSearchHit>], Never> {
            var collected: [SearchProviderEvent<PurchaseSearchHit>] = []
            for await event in stream { collected.append(event) }
            return collected
        }
        try await Task.sleep(for: .milliseconds(20))
        task.cancel()
        let collected = await task.value

        #expect(collected.isEmpty)
    }

    @Test("terminating the stream while delayed cancels the search")
    internal func terminationCancelsSearch() async throws {
        let tracker = CompletionTracker()
        let repository = DelayedPurchasesRepository(
            hits: [Self.purchaseHit], delay: .milliseconds(200), tracker: tracker)
        let reachability = ScriptedNetworkReachability(satisfied: true)
        var iterator =
            PurchasesSearchProvider(repository: repository, reachability: reachability)
            .answers(to: "bunnings", filter: PurchasesSearchFilter())
            .makeAsyncIterator()

        let firstCall = Task { await iterator.next() }
        try await Task.sleep(for: .milliseconds(20))
        firstCall.cancel()
        _ = await firstCall.value
        try await Task.sleep(for: .milliseconds(300))

        #expect(await tracker.completed == false)
    }

    private static var purchaseOrder: PurchaseSearchOrder {
        PurchaseSearchOrder(
            id: "order-1",
            merchant: .printed("Bunnings"),
            orderedOn: Date(timeIntervalSince1970: 0),
            total: MoneyAmount(minorUnits: 5_000, currencyCode: "AUD"),
            status: .awaitingSettlement)
    }

    private static var purchaseHit: PurchaseSearchHit {
        .purchase(purchaseOrder, printedMatch: nil)
    }

    private static var lineHit: PurchaseSearchHit {
        .line(
            id: "line-1", name: "Garden hose", quantity: 1,
            lineTotal: MoneyAmount(minorUnits: 2_000, currencyCode: "AUD"),
            order: purchaseOrder, tagMatch: nil)
    }

    private static func results(
        _ event: SearchProviderEvent<PurchaseSearchHit>?
    ) -> [PurchaseSearchHit]? {
        guard case .results(let results) = event else { return nil }
        return results
    }

    private static func isOffline(_ event: SearchProviderEvent<PurchaseSearchHit>?) -> Bool {
        guard case .offline = event else { return false }
        return true
    }

    private static func isFailed(_ event: SearchProviderEvent<PurchaseSearchHit>?) -> Bool {
        guard case .failed = event else { return false }
        return true
    }
}

/// Whether a delayed search call ran to completion, as opposed to being
/// cancelled mid-delay.
private actor CompletionTracker {
    private(set) var completed = false

    func markCompleted() { completed = true }
}

/// A repository whose `search` only marks ``CompletionTracker`` after its
/// delay, so a cancellation mid-delay is distinguishable from one that ran.
private struct DelayedPurchasesRepository: PurchasesRepository {
    let hits: [PurchaseSearchHit]
    let delay: Duration
    let tracker: CompletionTracker

    func search(text: String, status: PurchaseSearchStatus) async throws -> [PurchaseSearchHit] {
        try await Task.sleep(for: delay)
        await tracker.markCompleted()
        return hits
    }

    func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        PurchasePage(purchases: [], nextCursor: nil, totalCount: 0)
    }

    func monthSummary(for month: Date) async throws -> PurchasesMonthSummary { .empty }

    func purchaseDetail(id: Purchase.ID) async throws -> PurchaseDetail? { nil }

    func updatePurchase(
        id: Purchase.ID, _ update: PurchaseUpdate
    ) async throws -> PurchaseDetail? { nil }

    func receiptThumbnail(sha256: String) async throws -> ReceiptImage? { nil }

    func receiptImage(sha256: String) async throws -> ReceiptImage? { nil }
}
