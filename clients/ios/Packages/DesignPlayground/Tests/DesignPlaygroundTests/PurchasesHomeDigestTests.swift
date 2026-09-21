import AppCore
import Foundation
import Testing

@testable import DesignPlayground

/// What the purchases home may say about the rows it has loaded.
///
/// Every figure on the home is derived from one read, so these pin the places
/// a derivation could quietly misstate a person's spending: a delta invented
/// for a first month, currencies added together, a leaderboard for a
/// different month than the figure above it, or a just-saved row moved to the
/// top.
@Suite("Purchases home")
@MainActor
internal struct PurchasesHomeDigestTests {
    private let history = PurchasesFixtures.history
    private let reference = Date(timeIntervalSince1970: 1_789_257_600)

    private func purchase(
        _ id: String, _ name: String, daysAgo: Int, _ total: MoneyAmount,
        status: PurchaseSettlement = .awaitingSettlement
    ) -> Purchase {
        Purchase(
            id: id,
            merchant: .printed(name),
            orderedOn: reference.addingTimeInterval(TimeInterval(-daysAgo * 86_400)),
            total: total,
            itemCount: 1,
            receiptURI: nil,
            status: status)
    }

    @Test("the figure is the newest month's, and the delta compares it with the one before")
    func figureAndDelta() throws {
        let digest = PurchasesHomeDigest(history)
        let months = PurchasesPresentation.byMonth(history)

        #expect(digest.month == months.first?.month)
        #expect(digest.monthCount == months.first?.purchases.count)
        let delta = try #require(digest.delta)
        #expect(delta.against == months.dropFirst().first?.month)
        #expect(!delta.isUp)
        #expect(delta.amount.minorUnits == 25_025)
    }

    /// The first month anybody uses the app has nothing before it. Drawing a
    /// fall from zero would state a spending change that never happened.
    @Test("a single month has no delta")
    func firstMonthHasNoDelta() {
        let digest = PurchasesHomeDigest(PurchasesHomeFixtures.today)

        #expect(PurchasesPresentation.byMonth(PurchasesHomeFixtures.today).count == 1)
        #expect(digest.delta == nil)
    }

    @Test("a month in two currencies has two totals, never one sum")
    func currenciesAreNeverAdded() {
        let digest = PurchasesHomeDigest([
            purchase("a", "Shop A", daysAgo: 1, Fixtures.money(1_000)),
            purchase("b", "Shop B", daysAgo: 2, Fixtures.money(700, "USD")),
            purchase("c", "Shop C", daysAgo: 3, Fixtures.money(500)),
        ])

        #expect(digest.totals.count == 2)
        #expect(digest.totals.first == Fixtures.money(1_500))
        #expect(digest.totals.last == Fixtures.money(700, "USD"))
    }

    /// The panel sits under a figure naming one month, so it ranks that
    /// month. Ranking the whole history there would put Bunnings, an August
    /// purchase, under the September figure.
    @Test("where it went ranks only the figure's month, largest first, without the unattributed")
    func leadersAreTheFiguresMonth() throws {
        let digest = PurchasesHomeDigest(history)
        let month = try #require(PurchasesPresentation.byMonth(history).first)
        let monthIDs = Set(month.purchases.map(\.id))

        #expect(!digest.leaders.isEmpty)
        #expect(digest.leaders.allSatisfy { monthIDs.contains($0.sample.id) })
        #expect(!digest.leaders.contains { $0.name == "Bunnings" })
        #expect(!digest.leaders.contains { PurchasesPresentation.isUnattributed($0.sample) })
        let totals = digest.leaders.map(\.total.minorUnits)
        #expect(totals == totals.sorted(by: >))
    }

    @Test("where it went adds a merchant's purchases together and stops at four")
    func leadersGroupAndCap() {
        let digest = PurchasesHomeDigest([
            purchase("a1", "Shop A", daysAgo: 1, Fixtures.money(100)),
            purchase("b", "Shop B", daysAgo: 1, Fixtures.money(300)),
            purchase("a2", "Shop A", daysAgo: 2, Fixtures.money(250)),
            purchase("c", "Shop C", daysAgo: 2, Fixtures.money(200)),
            purchase("d", "Shop D", daysAgo: 3, Fixtures.money(150)),
            purchase("e", "Shop E", daysAgo: 3, Fixtures.money(50)),
        ])

        #expect(digest.leaders.map(\.name) == ["Shop A", "Shop B", "Shop C", "Shop D"])
        #expect(digest.leaders.first?.purchases == 2)
        #expect(digest.leaders.first?.total == Fixtures.money(350))
    }

    @Test("unmatched is every open purchase, and none once all are answered")
    func unmatchedCount() {
        #expect(
            PurchasesHomeDigest(history).unmatched.count
                == history.filter(\.status.isUnsettled).count)
        #expect(PurchasesHomeDigest(PurchasesHomeFixtures.allMatched).unmatched.isEmpty)
        #expect(PurchasesHomeFixtures.allMatched.count == history.count)
    }

    @Test("recent is the four newest")
    func recentIsTheNewestFour() {
        #expect(PurchasesHomeDigest(history).recent.map(\.id) == history.prefix(4).map(\.id))
    }

    /// A purchase's place is when it happened. Tongli is three days old, so
    /// it lands second, under Monster Sushi, not on top.
    @Test("a just-saved purchase lands where its date puts it")
    func justSavedLandsByDate() throws {
        let saved = try #require(history.first { $0.id == PurchasesHomeFixtures.justSavedID })

        let placed = PurchasesHomeDigest.landing(saved, in: PurchasesHomeFixtures.beforeSave)

        #expect(placed.map(\.id) == history.map(\.id))
        #expect(PurchasesHomeDigest(placed).recent.firstIndex { $0.id == saved.id } == 1)
    }

    @Test("landing a purchase already shown does not show it twice")
    func landingIsIdempotent() throws {
        let saved = try #require(history.first)

        #expect(PurchasesHomeDigest.landing(saved, in: history).count == history.count)
    }

    /// The five failures must stay distinct from each other and from the
    /// empty history: none may borrow another's glyph or title.
    @Test("every failure has its own glyph and title, and none reads as empty")
    func failuresAreDistinct() {
        let failures = PurchasesHomeFailure.allCases

        #expect(Set(failures.map(\.symbol)).count == failures.count)
        #expect(Set(failures.map(\.title)).count == failures.count)
        #expect(!failures.contains { $0.symbol == "receipt" || $0.title == "No purchases" })
    }

    @Test("only a failure a retry or a pairing can fix offers a button")
    func failureActions() {
        #expect(PurchasesHomeFailure.unavailable.action == .retry)
        #expect(PurchasesHomeFailure.transport.action == .retry)
        #expect(PurchasesHomeFailure.unauthorized.action == .pair)
        #expect(PurchasesHomeFailure.contractMismatch.action == nil)
        #expect(PurchasesHomeFailure.dependencyNotBound.action == nil)
    }
}
