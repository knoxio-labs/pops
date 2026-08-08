import AppCore
import AppCoreFakes
import Testing

/// Every feature's tests are only as trustworthy as these are.
@Suite("Fakes")
struct FakesTests {
    @Test("pages are served in order and the last one terminates")
    func pagesTerminate() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 3), pageSize: 2)

        let first = try await repository.transactions(after: nil)
        #expect(first.transactions.map(\.id) == ["txn-0", "txn-1"])
        let cursor = try #require(first.nextCursor)

        let second = try await repository.transactions(after: cursor)
        #expect(second.transactions.map(\.id) == ["txn-2"])
        #expect(second.nextCursor == nil)
    }

    @Test("an empty repository returns an empty last page rather than a cursor")
    func emptyRepository() async throws {
        let page = try await InMemoryTransactionsRepository().transactions(after: nil)

        #expect(page.transactions.isEmpty)
        #expect(page.nextCursor == nil)
    }

    @Test("a page boundary landing exactly on the end does not offer another page")
    func exactPageBoundary() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2), pageSize: 2)

        let page = try await repository.transactions(after: nil)

        #expect(page.transactions.count == 2)
        #expect(page.nextCursor == nil)
    }

    @Test("calls are counted, which is what a duplicate-fetch bug is caught with")
    func countsCalls() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))

        _ = try await repository.transactions(after: nil)
        _ = try await repository.transactions(after: "2")

        #expect(await repository.callCount == 2)
    }

    @Test("concurrent reads are each counted exactly once")
    func countsConcurrentCalls() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<20 {
                group.addTask { _ = try? await repository.transactions(after: nil) }
            }
        }

        #expect(await repository.callCount == 20)
    }

    @Test("a failure can be injected partway through a scroll")
    func injectsFailureMidScroll() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4), pageSize: 2)
        await repository.fail(onCall: 2, with: .unauthorized)

        _ = try await repository.transactions(after: nil)

        await #expect(throws: RepositoryError.unauthorized) {
            try await repository.transactions(after: "2")
        }
    }

    @Test("a cursor the repository never minted is a contract mismatch")
    func rejectsInventedCursor() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.transactions(after: "not-a-cursor")
        }
    }

    @Test("replacing the rows is what a refresh reads")
    func replaceRows() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))

        await repository.replace(with: [Transaction.fake(id: "txn-new")])
        let page = try await repository.transactions(after: nil)

        #expect(page.transactions.map(\.id) == ["txn-new"])
    }

    @Test("the pairing fake records what it was asked and answers as configured")
    func pairingFakeRecords() async throws {
        let service = FakeDevicePairingService()
        let request = PairingRequest.fake()

        let device = try await service.pair(request)

        #expect(device == PairedDevice.fake())
        #expect(await service.callCount == 1)
        #expect(await service.requests == [request])
    }

    @Test("the pairing fake can be told to reject")
    func pairingFakeRejects() async {
        let service = FakeDevicePairingService(result: .failure(.codeRejected))

        await #expect(throws: PairingError.codeRejected) {
            try await service.pair(.fake())
        }
    }
}
