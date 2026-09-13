import AppCore
import Testing

@testable import DesignPlayground

/// What the archive may say about a history it has only partly loaded.
///
/// The mobile route pages and returns no count, so every figure on the
/// archive is derived from loaded rows. These pin the one place that could
/// quietly lie: a month total drawn as whole while its older rows are still on
/// a page nobody has asked for.
@Suite("Purchases archive")
@MainActor
internal struct PurchasesArchiveTests {
    private let history = PurchasesFixtures.history
    private var firstPage: [Purchase] { Array(history.prefix(9)) }

    private func purchase(_ id: String) throws -> Purchase {
        try #require(history.first { $0.id == id })
    }

    @Test("with more to load, only the oldest month is incomplete")
    func onlyTheOldestMonthIsIncomplete() throws {
        let months = PurchasesArchive.months(firstPage, scope: .all, paging: .loading)

        #expect(months.count >= 2, "the fixture page has to span a boundary to prove anything")
        #expect(months.dropLast().allSatisfy { !$0.isIncomplete })
        #expect(months.last?.isIncomplete == true)
    }

    /// A failed page is still a page that exists. Calling the month finished
    /// because the request for the rest of it failed would be the error
    /// rewriting the arithmetic.
    @Test("a failed page leaves the oldest month incomplete")
    func aFailedPageIsStillMore() {
        let months = PurchasesArchive.months(firstPage, scope: .all, paging: .failed)

        #expect(months.last?.isIncomplete == true)
    }

    @Test("once the end is reached, no month is incomplete")
    func theEndCompletesEveryMonth() {
        let months = PurchasesArchive.months(history, scope: .all, paging: .end)

        #expect(!months.isEmpty)
        #expect(months.allSatisfy { !$0.isIncomplete })
    }

    @Test("the unmatched scope holds every unsettled purchase and nothing else")
    func unmatchedIsExactlyTheUnsettled() {
        let shown = PurchasesArchive.months(history, scope: .unmatched, paging: .end)
            .flatMap(\.purchases)

        #expect(!shown.isEmpty)
        #expect(shown.allSatisfy { $0.status.isUnsettled })
        #expect(shown.count == history.filter { $0.status.isUnsettled }.count)
    }

    /// The loaded page ends in August with only settled rows there. Under the
    /// unmatched scope August is not drawn at all, and September must not
    /// inherit August's incompleteness just because it is now the oldest
    /// month on screen.
    @Test("the page boundary is where the page ended, not where the filter ended")
    func theBoundaryIgnoresTheFilter() throws {
        let loaded = [
            try purchase("pur-sushi"), try purchase("pur-kmart"), try purchase("pur-coffee"),
        ]

        let months = PurchasesArchive.months(loaded, scope: .unmatched, paging: .loading)

        #expect(months.count == 1)
        #expect(months.first?.isIncomplete == false)
    }

    @Test("nothing loaded is no months")
    func nothingLoadedIsNoMonths() {
        #expect(PurchasesArchive.months([], scope: .all, paging: .loading).isEmpty)
        #expect(PurchasesArchive.months([], scope: .unmatched, paging: .end).isEmpty)
    }

    @Test("in the whole history, a badge marks exactly the open purchases")
    func badgesInTheWholeHistory() {
        let marked = history.allSatisfy {
            PurchasesArchive.showsBadge($0, in: .all) == $0.status.isUnsettled
        }

        #expect(marked)
    }

    /// Every row under the unmatched scope is unmatched. A badge saying so on
    /// each is the scope repeated; a part-matched one is the exception worth
    /// marking.
    @Test("under the unmatched scope only a part-matched purchase keeps its badge")
    func badgesUnderTheUnmatchedScope() throws {
        let partial = try #require(history.first { $0.status == .partial })
        let waiting = try #require(history.first { $0.status == .awaitingSettlement })

        #expect(PurchasesArchive.showsBadge(partial, in: .unmatched))
        #expect(!PurchasesArchive.showsBadge(waiting, in: .unmatched))
    }
}
