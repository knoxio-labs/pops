import AppCore
import AppCoreFakes
import Testing

@Suite("Purchases repository fake")
internal struct PurchasesRepositoryTests {
    @Test("pages are served in order and the last one terminates")
    func pagesTerminate() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 3), pageSize: 2)

        let first = try await repository.purchases(after: nil, statusFilter: .all)
        #expect(first.purchases.map(\.id) == ["purchase-0", "purchase-1"])
        let cursor = try #require(first.nextCursor)

        let second = try await repository.purchases(after: cursor, statusFilter: .all)
        #expect(second.purchases.map(\.id) == ["purchase-2"])
        #expect(second.nextCursor == nil)
    }

    @Test("an empty repository returns an empty last page")
    func emptyRepository() async throws {
        let page = try await InMemoryPurchasesRepository().purchases(
            after: nil, statusFilter: .all)

        #expect(page.purchases.isEmpty)
        #expect(page.nextCursor == nil)
        #expect(page.totalCount == 0)
    }

    @Test("a page ending exactly at the boundary has no next cursor")
    func exactPageBoundary() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 2), pageSize: 2)

        let page = try await repository.purchases(after: nil, statusFilter: .all)

        #expect(page.purchases.count == 2)
        #expect(page.nextCursor == nil)
    }

    @Test("page calls are counted")
    func callsAreCounted() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 3), pageSize: 2)

        let cursor = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).nextCursor)
        _ = try await repository.purchases(after: cursor, statusFilter: .all)

        #expect(await repository.callCount == 2)
    }

    @Test("the first call can fail as configured")
    func failureIsInjectable() async {
        let repository = InMemoryPurchasesRepository(rows: Purchase.fakes(count: 1))
        await repository.fail(onCall: 1, with: .unavailable)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.purchases(after: nil, statusFilter: .all)
        }
    }

    @Test("a cursor the repository never minted is rejected")
    func rejectsInventedCursor() async {
        let repository = InMemoryPurchasesRepository(rows: Purchase.fakes(count: 2))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchases(after: "not-a-cursor", statusFilter: .all)
        }
    }

    @Test("an offset derived by a caller is rejected")
    func rejectsDerivedCursor() async {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 4), pageSize: 2)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchases(after: "2", statusFilter: .all)
        }
    }

    @Test("a cursor held across replacement stays rejected after the new list mints a cursor")
    func rejectsCursorHeldAcrossReplacement() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 4), pageSize: 2)
        let staleCursor = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).nextCursor)

        await repository.replace(with: Purchase.fakes(count: 4))
        let currentCursor = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).nextCursor)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchases(after: staleCursor, statusFilter: .all)
        }
        #expect(staleCursor != currentCursor)
        #expect(
            try await repository.purchases(after: currentCursor, statusFilter: .all)
                .purchases.map(\.id) == ["purchase-2", "purchase-3"])
    }

    @Test("replacing purchases changes the next first page")
    func replacementIsRead() async throws {
        let repository = InMemoryPurchasesRepository(rows: Purchase.fakes(count: 2))

        await repository.replace(with: [.fake(id: "purchase-new")])
        let page = try await repository.purchases(after: nil, statusFilter: .all)

        #expect(page.purchases.map(\.id) == ["purchase-new"])
    }

    @Test("unsettled purchases are filtered before pagination")
    func unsettledPurchasesAreFilteredBeforePaging() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: [
                .fake(id: "waiting", status: .awaitingSettlement),
                .fake(id: "linked", status: .linked),
                .fake(id: "partial", status: .partial),
            ],
            pageSize: 1
        )

        let first = try await repository.purchases(after: nil, statusFilter: .unsettled)
        #expect(first.purchases.map(\.id) == ["waiting"])
        #expect(first.totalCount == 2)
        let cursor = try #require(first.nextCursor)

        let second = try await repository.purchases(after: cursor, statusFilter: .unsettled)
        #expect(second.purchases.map(\.id) == ["partial"])
        #expect(second.nextCursor == nil)
        #expect(second.totalCount == nil)
    }

    @Test("a cursor continues under the filter that minted it")
    func cursorKeepsItsFilter() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 3), pageSize: 1)
        let first = try await repository.purchases(after: nil, statusFilter: .all)
        let cursor = try #require(first.nextCursor)

        let second = try await repository.purchases(after: cursor, statusFilter: .all)

        #expect(second.purchases.map(\.id) == ["purchase-1"])
    }

    @Test("a cursor cannot be reused after both filters mint the same page boundary")
    func cursorRejectsAnotherFilter() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: [
                .fake(id: "first", status: .awaitingSettlement),
                .fake(id: "second", status: .partial),
                .fake(id: "third", status: .awaitingSettlement),
            ],
            pageSize: 1)
        let allCursor = try #require(
            try await repository.purchases(after: nil, statusFilter: .all).nextCursor)
        let unsettledCursor = try #require(
            try await repository.purchases(after: nil, statusFilter: .unsettled).nextCursor)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchases(after: allCursor, statusFilter: .unsettled)
        }
        #expect(allCursor != unsettledCursor)
        #expect(
            try await repository.purchases(after: unsettledCursor, statusFilter: .unsettled)
                .purchases.map(\.id) == ["second"])
    }
}
