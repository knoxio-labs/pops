import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureTransactions

/// How a tap becomes a screen, and the coupling that is not allowed to exist
/// between the two ends of it.
@MainActor
@Suite("Transactions navigation")
internal struct TransactionsNavigationTests {
    private func model(
        _ repository: any TransactionsRepository,
        router: Router
    ) -> TransactionsListViewModel {
        TransactionsListViewModel(dependencies: .fake(transactions: repository), router: router)
    }

    @Test("tapping a row pushes that transaction's route")
    func selectingPushesTheDetailRoute() async {
        let router = Router()
        let model = model(
            InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2)), router: router)
        await model.loadFirstPage()

        model.select(Transaction.fake(id: "txn-1"))

        #expect(router.path == [.transactionDetail(id: "txn-1")])
    }

    /// The reducer already refuses a repeated push, and this is the gesture
    /// that produces one: a double tap delivers two selections before the first
    /// frame renders. Asserted from here because the list is where it happens.
    @Test("a double tap does not push two identical screens")
    func aDoubleTapPushesOnce() async {
        let router = Router()
        let model = model(
            InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2)), router: router)
        await model.loadFirstPage()

        model.select(Transaction.fake(id: "txn-1"))
        model.select(Transaction.fake(id: "txn-1"))

        #expect(router.path == [.transactionDetail(id: "txn-1")])
    }

    @Test("the list hands over the row it is already holding")
    func theListSeedsTheDetail() async {
        let rows = Transaction.fakes(count: 2)
        let model = model(InMemoryTransactionsRepository(rows: rows), router: Router())
        await model.loadFirstPage()

        #expect(model.transaction(id: "txn-1") == rows[1])
    }

    /// `nil` is an honest answer rather than a miss to work around. The detail
    /// screen loads from scratch when it gets one, which is the same path a
    /// route restored on a cold launch takes.
    @Test("a row the list does not have seeds nothing")
    func anUnknownRowSeedsNothing() async {
        let model = model(
            InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2)), router: Router())
        await model.loadFirstPage()

        #expect(model.transaction(id: "txn-99") == nil)
    }

    /// A list that never loaded, or one showing an outage, is holding nothing —
    /// and must say so rather than reaching into a state that has no rows.
    @Test("a list with no rows seeds nothing")
    func anEmptyListSeedsNothing() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        await repository.fail(onCall: 1, with: .unavailable)
        let model = model(repository, router: Router())
        await model.loadFirstPage()

        #expect(model.state == .failed(.unavailable))
        #expect(model.transaction(id: "txn-1") == nil)
    }
}

/// The half of the seam a type checker cannot hold.
///
/// `TransactionsFlowView` maps a route to a view; the list names a route and
/// nothing else. Both screens live in this module, so the compiler is no help
/// — nothing stops the list from constructing `TransactionDetailView` directly,
/// and if it ever did, every test above would still pass while the indirection
/// they are about had quietly stopped existing.
///
/// So this reads the sources, the same technique and for the same reason as
/// `AppCore`'s `ModuleBoundaryTests`.
@Suite("Transactions screen boundary")
internal struct TransactionsScreenBoundaryTests {
    /// `.../Tests/FeatureTransactionsTests/TransactionsNavigationTests.swift`
    private static let sources = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/FeatureTransactions")

    /// The files that make up the list screen. Named rather than inferred: the
    /// rule is about these three specifically, and a pattern would quietly stop
    /// covering one that got renamed.
    private static let listFiles = [
        "TransactionsListView.swift",
        "TransactionsListViewModel.swift",
        "TransactionRowView.swift",
    ]

    /// The types only the route table may name.
    private static let detailTypes = ["TransactionDetailView", "TransactionDetailViewModel"]

    private func source(_ name: String) throws -> String {
        try String(contentsOf: Self.sources.appending(path: name), encoding: .utf8)
    }

    /// The scan finds real files with real content in them, or every assertion
    /// below holds just as well for a tree where the list was deleted.
    @Test("the scan is reading the list's sources")
    func scanIsWiredUp() throws {
        for file in Self.listFiles {
            #expect(try !source(file).isEmpty, "\(file) is empty or missing")
        }
    }

    @Test("the list names neither of the detail screen's types")
    func theListDoesNotNameTheDetailScreen() throws {
        for file in Self.listFiles {
            let text = try source(file)
            for type in Self.detailTypes {
                #expect(!text.contains(type), "\(file) names \(type)")
            }
        }
    }

    /// The other end of the same rule. If nothing constructed the detail screen
    /// the check above would pass on a tree where the route goes nowhere.
    @Test("the route table is what constructs the detail screen")
    func theFlowConstructsTheDetailScreen() throws {
        let flow = try source("TransactionsFlowView.swift")

        for type in Self.detailTypes {
            #expect(flow.contains(type), "TransactionsFlowView does not name \(type)")
        }
    }
}
