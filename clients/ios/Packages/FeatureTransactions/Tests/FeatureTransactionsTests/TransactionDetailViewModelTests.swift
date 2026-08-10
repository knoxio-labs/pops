import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

/// What the detail screen decides, against a fake.
///
/// The distinction every test here circles is the one the screen exists to
/// keep: a transaction finance no longer has is an outcome, and a fetch that
/// failed is a failure. They are different states, they read differently, and
/// only one of them offers a retry.
@MainActor
@Suite("Transaction detail")
internal struct TransactionDetailViewModelTests {
    private static let row = Transaction.fake(id: "txn-1", description: "Flat white")
    private static let record = TransactionDetail.fake(id: "txn-1", description: "Flat white")

    private func model(
        _ repository: any TransactionsRepository,
        seed: Transaction? = nil,
        id: Transaction.ID = "txn-1"
    ) -> TransactionDetailViewModel {
        TransactionDetailViewModel(
            id: id,
            seed: seed,
            dependencies: .fake(transactions: repository)
        )
    }

    private func repository(
        details: [TransactionDetail] = [TransactionDetailViewModelTests.record]
    ) -> InMemoryTransactionsRepository {
        InMemoryTransactionsRepository(details: details)
    }

    @Test("the fuller record replaces nothing when there was nothing")
    func loadsTheRecord() async {
        let model = model(repository())
        #expect(model.state == .loading)

        await model.load()

        #expect(model.state == .loaded(Self.record))
        #expect(model.failure == nil)
    }

    /// The seeded path, which is the whole reason this screen does not open on
    /// a spinner: the row the list already had is on screen *before* anything
    /// is asked for, and is replaced by the fuller record when it lands.
    @Test("it opens on the list's row and fills in")
    func seededThenRefreshed() async {
        let model = model(repository(), seed: Self.row)
        #expect(model.state == .seeded(Self.row))

        await model.load()

        #expect(model.state == .loaded(Self.record))
    }

    /// The whole point of seeding, and the half `seededThenRefreshed` cannot
    /// see: *while* the fetch is in flight the row is on screen, rather than a
    /// spinner drawn over data the app has had all along.
    ///
    /// Worth pinning rather than assuming. A preview that claimed to show this
    /// state was in fact showing the not-found screen, because "no record" and
    /// "no answer yet" look identical from the outside and only one of them
    /// keeps the seed.
    @Test("a seeded row stays on screen while the record is being fetched")
    func aSeedSurvivesUntilTheRecordLands() async {
        let repository = ScriptedTransactionsRepository(
            detailScript: [.detail(Self.record)], gatingDetail: [1])
        let model = model(repository, seed: Self.row)

        let load = Task { await model.load() }
        await repository.waitUntilDetailCalled(1)

        #expect(model.state == .seeded(Self.row), "the seed was dropped before an answer arrived")

        await repository.release()
        await load.value

        #expect(model.state == .loaded(Self.record))
    }

    /// A transaction deleted between the list arriving and somebody tapping it.
    /// Not a failure, and the difference is load-bearing: `.failed` draws a
    /// retry, and there is nothing here retrying would find.
    @Test("a transaction finance no longer has is not a failure")
    func notFound() async {
        let model = model(repository(details: []))

        await model.load()

        #expect(model.state == .notFound)
        #expect(model.failure == nil)
    }

    /// The seed does not survive the record being gone. Continuing to draw a
    /// row for a transaction that no longer exists is a screen asserting
    /// something false, which is worse than a screen saying it has nothing.
    @Test("a seeded row is dropped when the record turns out to be gone")
    func notFoundReplacesTheSeed() async {
        let model = model(repository(details: []), seed: Self.row)

        await model.load()

        #expect(model.state == .notFound)
    }

    /// Nothing on screen and the fetch failed: the screen *is* the failure, and
    /// the retry is the only thing on it.
    @Test("a failure with nothing to show becomes the screen, and retries")
    func unavailableThenRetry() async {
        let repository = repository()
        await repository.failDetail(onCall: 1, with: .unavailable)
        let model = model(repository)

        await model.load()
        #expect(model.state == .failed(.unavailable))

        await model.load()

        #expect(model.state == .loaded(Self.record))
        #expect(await repository.detailCallCount == 2)
    }

    /// The other half of the same rule, and the one the list already follows
    /// for a failed refresh: what is on screen is true, so a failure sits
    /// beside it rather than deleting it.
    @Test("a failure over a seeded row keeps the row and says why")
    func failureKeepsTheSeededRow() async {
        let repository = repository()
        await repository.failDetail(onCall: 1, with: .unavailable)
        let model = model(repository, seed: Self.row)

        await model.load()

        #expect(model.state == .seeded(Self.row))
        #expect(model.failure == .unavailable)
    }

    @Test("a retry that works clears the failure the last one left")
    func retryClearsTheFailure() async {
        let repository = repository()
        await repository.failDetail(onCall: 1, with: .unavailable)
        let model = model(repository, seed: Self.row)
        await model.load()
        #expect(model.failure == .unavailable)

        await model.load()

        #expect(model.state == .loaded(Self.record))
        #expect(model.failure == nil)
    }

    /// The banner is announced to VoiceOver from an `onChange`, so a failure
    /// written on top of an identical one changes nothing and is therefore said
    /// nothing about. Clearing before the request is what makes every failure a
    /// `nil -> error` transition; this is the observable form of that.
    @Test("a retry clears the previous failure before it asks again")
    func retryClearsTheFailureBeforeAsking() async {
        let repository = ScriptedTransactionsRepository(
            detailScript: [
                .failing(RepositoryError.unavailable),
                .failing(RepositoryError.unavailable),
            ],
            gatingDetail: [2]
        )
        let model = model(repository, seed: Self.row)
        await model.load()
        #expect(model.failure == .unavailable)

        let retry = Task { await model.load() }
        await repository.waitUntilDetailCalled(2)

        #expect(model.failure == nil, "a retry left the previous failure standing")

        await repository.release()
        await retry.value

        #expect(model.failure == .unavailable)
    }

    /// An answer is an answer, including a definite absence. Re-appearing must
    /// not re-ask — on this screen the request is what a `.task` fires, and a
    /// screen that refetches every time somebody swipes back to it bills the
    /// difference to a cellular plan.
    @Test("a record that has landed is not fetched again")
    func doesNotRefetch() async {
        let repository = repository()
        let model = model(repository)
        await model.load()

        await model.load()

        #expect(await repository.detailCallCount == 1)
    }

    @Test("a definite absence is not fetched again either")
    func doesNotRefetchAnAbsence() async {
        let repository = repository(details: [])
        let model = model(repository)
        await model.load()

        await model.load()

        #expect(model.state == .notFound)
        #expect(await repository.detailCallCount == 1)
    }

    /// Two `.task` invocations before the first answers. Without the guard both
    /// fetch, which on this screen is one wasted request per appearance.
    @Test("two loads racing produce one request")
    func loadIsNotReentrant() async {
        let repository = ScriptedTransactionsRepository(
            detailScript: [.detail(Self.record)], gatingDetail: [1])
        let model = model(repository)

        let first = Task { await model.load() }
        await repository.waitUntilDetailCalled(1)
        let second = Task { await model.load() }

        await repository.release()
        await first.value
        await second.value

        #expect(await repository.detailCallCount == 1)
    }

    /// The repository protocol does not constrain what it throws, so anything a
    /// layer below raises has to land somewhere a screen can act on rather than
    /// escaping as an unhandled type.
    @Test("something this app has never heard of becomes a transport failure")
    func unrecognisedFailuresAreDescribed() async {
        let repository = ScriptedTransactionsRepository(
            detailScript: [.failing(UnrecognisedRepositoryFailure())])
        let model = model(repository)

        await model.load()

        guard case .failed(.transport) = model.state else {
            Issue.record("expected a transport failure, got \(model.state)")
            return
        }
    }

    /// A dependency nobody bound has to reach a screen as a state rather than
    /// as a crash on somebody's phone.
    @Test("an unbound repository is a failure state, not a trap")
    func unboundDependencyIsAState() async {
        let model = TransactionDetailViewModel(id: "txn-1", seed: nil, dependencies: .unbound)

        await model.load()

        #expect(model.state == .failed(.dependencyNotBound))
    }

    /// The id is the route's, not the seed's. A seed is a convenience and must
    /// never be what decides which record is fetched.
    @Test("the route's id is what is asked for")
    func fetchesTheRoutesID() async {
        let repository = ScriptedTransactionsRepository(detailScript: [.gone])
        let model = model(repository, seed: Self.row, id: "txn-other")

        await model.load()

        #expect(await repository.requestedDetailIDs == ["txn-other"])
    }
}
