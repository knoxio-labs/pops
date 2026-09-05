import AppCore
import Testing

@testable import DesignPlayground

/// ``PlaygroundRefreshFailureRepository`` exists specifically to
/// answer the same `cursor: nil` request two different ways, which is the one
/// thing ``PlaygroundTransactionsRepository`` cannot do. These tests are what
/// would catch a regression to "always succeeds" or "always fails" — either of
/// which would silently turn the transactions list's `refresh-failed` design
/// state back into `default`.
@Suite("PlaygroundRefreshFailureRepository")
internal struct PlaygroundRefreshFailureRepositoryTests {
    private let page = TransactionPage(transactions: [], nextCursor: nil)

    @Test("the first call succeeds")
    func firstCallSucceeds() async throws {
        let repository = PlaygroundRefreshFailureRepository(
            firstPage: page, refreshFailure: .unavailable)

        let result = try await repository.transactions(after: nil)

        #expect(result == page)
    }

    @Test("a second call over the same cursor fails")
    func secondCallFails() async throws {
        let repository = PlaygroundRefreshFailureRepository(
            firstPage: page, refreshFailure: .transport("host unreachable"))

        _ = try await repository.transactions(after: nil)

        await #expect(throws: RepositoryError.transport("host unreachable")) {
            try await repository.transactions(after: nil)
        }
    }

    @Test("every call after the first keeps failing")
    func thirdCallAlsoFails() async throws {
        let repository = PlaygroundRefreshFailureRepository(
            firstPage: page, refreshFailure: .unavailable)

        _ = try await repository.transactions(after: nil)
        _ = try? await repository.transactions(after: nil)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.transactions(after: nil)
        }
    }

    @Test("the detail lookup answers nil, since no state built on this needs a row")
    func detailIsAlwaysNil() async throws {
        let repository = PlaygroundRefreshFailureRepository(
            firstPage: page, refreshFailure: .unavailable)

        let detail = try await repository.transactionDetail(id: "t1")

        #expect(detail == nil)
    }
}
