import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases archive")
@MainActor
internal struct PurchasesArchiveTests {
    private let history = [
        purchase("sep-open", month: 9, day: 20, status: .awaitingSettlement),
        purchase("sep-linked", month: 9, day: 10, status: .linked),
        purchase("aug-partial", month: 8, day: 20, status: .partial),
        purchase("aug-linked", month: 8, day: 10, status: .linked),
        purchase("jul-linked-2", month: 7, day: 20, status: .linked),
        purchase("jul-linked", month: 7, day: 10, status: .linked),
    ]

    @Test("with more to load, only the oldest month is incomplete")
    func onlyTheOldestMonthIsIncomplete() {
        let months = PurchasesArchive.months(history, scope: .all, paging: .loading)

        #expect(months.count >= 2, "the fixture page has to span a boundary to prove anything")
        #expect(months.dropLast().allSatisfy { !$0.isIncomplete })
        #expect(months.last?.isIncomplete == true)
    }

    @Test("a failed page leaves the oldest month incomplete")
    func failedPageIsStillMore() {
        let months = PurchasesArchive.months(history, scope: .all, paging: .failed)

        #expect(months.last?.isIncomplete == true)
    }

    @Test("once the end is reached, no month is incomplete")
    func endCompletesEveryMonth() {
        let months = PurchasesArchive.months(history, scope: .all, paging: .end)

        #expect(!months.isEmpty)
        #expect(months.allSatisfy { !$0.isIncomplete })
    }

    @Test("the unmatched scope holds every unsettled purchase and nothing else")
    func unmatchedIsExactlyUnsettled() {
        let shown = PurchasesArchive.months(history, scope: .unmatched, paging: .end)
            .flatMap(\.purchases)

        #expect(!shown.isEmpty)
        #expect(shown.allSatisfy { $0.status.isUnsettled })
        #expect(shown.count == history.filter { $0.status.isUnsettled }.count)
    }

    @Test("each scope marks its own oldest loaded month incomplete")
    func boundaryIsPerScope() {
        let all = PurchasesArchive.months(history, scope: .all, paging: .loading)
        let unmatched = PurchasesArchive.months(history, scope: .unmatched, paging: .loading)

        #expect(all.last.map { Calendar.current.component(.month, from: $0.month) } == 7)
        #expect(unmatched.last.map { Calendar.current.component(.month, from: $0.month) } == 8)
        #expect(all.last?.isIncomplete == true)
        #expect(unmatched.last?.isIncomplete == true)
    }

    @Test("nothing loaded is no months")
    func nothingLoadedIsNoMonths() {
        #expect(PurchasesArchive.months([], scope: .all, paging: .loading).isEmpty)
        #expect(PurchasesArchive.months([], scope: .unmatched, paging: .end).isEmpty)
    }

    @Test("in the whole history, a badge marks exactly the open purchases")
    func badgesInWholeHistory() {
        #expect(
            history.allSatisfy {
                PurchasesArchive.showsBadge($0, in: .all) == $0.status.isUnsettled
            })
    }

    @Test("under unmatched only a part-matched purchase keeps its badge")
    func badgesUnderUnmatched() throws {
        let partial = try #require(history.first { $0.status == .partial })
        let waiting = try #require(history.first { $0.status == .awaitingSettlement })

        #expect(PurchasesArchive.showsBadge(partial, in: .unmatched))
        #expect(!PurchasesArchive.showsBadge(waiting, in: .unmatched))
    }

    @Test("archive scopes map to their server filters")
    func statusFilters() {
        #expect(PurchasesArchiveScope.all.statusFilter == .all)
        #expect(PurchasesArchiveScope.unmatched.statusFilter == .unsettled)
    }

    private static func purchase(
        _ id: String, month: Int, day: Int, status: PurchaseSettlement
    ) -> Purchase {
        .fake(id: id, orderedOn: date(month: month, day: day), status: status)
    }

    private static func date(month: Int, day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return calendar.date(from: DateComponents(year: 2026, month: month, day: day))
            ?? .distantPast
    }
}
