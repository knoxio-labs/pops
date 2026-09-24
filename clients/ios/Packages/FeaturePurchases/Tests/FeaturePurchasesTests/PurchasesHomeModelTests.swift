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

    @Test("a refresh failure reports the last successful read time")
    func refreshFailureUsesSuccessfulReadTime() async throws {
        let loadedAt = Date(timeIntervalSince1970: 1_789_000_000)
        let clock = HomeClock(now: loadedAt)
        let repository = MutableHomeRepository(rows: [.fake(id: "kept")])
        let model = PurchasesHomeModel(
            dependencies: .fake(purchases: repository), now: { clock.now })
        await model.load()
        clock.now = loadedAt.addingTimeInterval(3_600)
        await repository.setFailure(.unavailable)

        await model.refresh()

        guard case .loaded(_, .failed(let updated)) = model.phase else {
            Issue.record("Expected a failed refresh")
            return
        }
        #expect(updated == PurchasesHomeCopy.time(loadedAt))
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
        #expect(await repository.calls() == callsBeforeLanding + 3)
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
        #expect(await repository.calls() == callsBeforeLanding + 3)
    }

    @Test("an ordinary refresh clears the saved highlight after capture lands")
    func ordinaryRefreshClearsSavedHighlights() async throws {
        let model = PurchasesHomeModel(
            dependencies: .fake(purchases: MutableHomeRepository(rows: [.fake(id: "row")])))
        await model.load()
        await model.land(savedIDs: ["saved"])

        #expect(model.highlighted == ["saved"])

        await model.refresh()

        #expect(model.highlighted.isEmpty)
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

    @Test("cancelling an overlapping refresh does not leave the phase refreshing")
    func overlappingRefreshCancellationRestoresCurrentPhase() async throws {
        let staleGate = HomeGate()
        let row = Purchase.fake(id: "row")
        let repository = SequencedHomeRepository(
            pages: [
                .immediate(page([row])), .gated(staleGate, page([row])), .cancelled,
            ],
            summaries: [
                .immediate(.empty), .gated(staleGate, .empty), .immediate(.empty),
            ])
        let model = PurchasesHomeModel(dependencies: .fake(purchases: repository))
        await model.load()

        let stale = Task { await model.refresh() }
        await repository.waitForCalls(4)
        await model.refresh()
        await staleGate.open()
        await stale.value

        guard case .loaded(_, let refresh) = model.phase else {
            Issue.record("Expected loaded content")
            return
        }
        #expect(refresh == .current)
    }

    @Test("summary facts drive the month; the unmatched tile counts the unsettled backlog")
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
            rows: [.fake(id: "unsettled-row"), .fake(id: "linked-row", status: .linked)],
            summary: summary)
        let model = PurchasesHomeModel(dependencies: .fake(purchases: repository))

        await model.load()

        let digest = try loaded(model.phase)
        #expect(digest.allCount == 2)
        #expect(digest.monthCount == 19)
        #expect(digest.unmatchedCount == 1)
        #expect(digest.unmatched.map(\.id) == ["unsettled-row"])
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
