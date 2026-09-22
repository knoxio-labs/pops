import AppCore
import AppCoreFakes
import Testing

/// Every feature's tests are only as trustworthy as these are.
@Suite("Fakes")
internal struct FakesTests {
    @Test("pages are served in order and the last one terminates")
    func pagesTerminate() async throws {
        let repository = InMemoryTransactionsRepository(
            rows: Transaction.fakes(count: 3), pageSize: 2)

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
        let repository = InMemoryTransactionsRepository(
            rows: Transaction.fakes(count: 2), pageSize: 2)

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
        let repository = InMemoryTransactionsRepository(
            rows: Transaction.fakes(count: 4), pageSize: 2)
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

    @Test("an offset a client derived for itself is rejected, not answered")
    func rejectsDerivedCursor() async {
        let repository = InMemoryTransactionsRepository(
            rows: Transaction.fakes(count: 4), pageSize: 2)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.transactions(after: "0")
        }
    }

    @Test("a cursor held across a refresh is rejected rather than reading the new rows")
    func rejectsCursorHeldAcrossRefresh() async throws {
        let repository = InMemoryTransactionsRepository(
            rows: Transaction.fakes(count: 4), pageSize: 2)
        let cursor = try #require(try await repository.transactions(after: nil).nextCursor)

        await repository.replace(with: Transaction.fakes(count: 4))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.transactions(after: cursor)
        }
    }

    @Test("replacing the rows is what a refresh reads")
    func replaceRows() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))

        await repository.replace(with: [Transaction.fake(id: "txn-new")])
        let page = try await repository.transactions(after: nil)

        #expect(page.transactions.map(\.id) == ["txn-new"])
    }

    @Test("the fuller record comes back for a row the fake has one for")
    func detailIsServed() async throws {
        let record = TransactionDetail.fake(id: "txn-1", notes: "the one under test")
        let repository = InMemoryTransactionsRepository(details: [record])

        #expect(try await repository.transactionDetail(id: "txn-1") == record)
    }

    /// The absence has to be an answer rather than a throw, because that is the
    /// distinction every screen reading this fake is built around.
    @Test("a row the fake has no record for is an absence, not a failure")
    func detailAbsenceIsNotAFailure() async throws {
        let repository = InMemoryTransactionsRepository(details: [TransactionDetail.fake()])

        #expect(try await repository.transactionDetail(id: "txn-missing") == nil)
    }

    /// Counted apart from the page calls, or "did the footer fetch twice" would
    /// depend on whether anybody happened to open a row.
    @Test("detail calls are counted separately from page calls")
    func detailCallsAreCountedApart() async throws {
        let repository = InMemoryTransactionsRepository(
            rows: Transaction.fakes(count: 4), details: [TransactionDetail.fake()])

        _ = try await repository.transactions(after: nil)
        _ = try await repository.transactionDetail(id: "txn-1")
        _ = try await repository.transactionDetail(id: "txn-1")

        #expect(await repository.callCount == 1)
        #expect(await repository.detailCallCount == 2)
    }

    @Test("a detail failure can be injected, and only on the call it names")
    func detailFailureIsInjectable() async throws {
        let record = TransactionDetail.fake()
        let repository = InMemoryTransactionsRepository(details: [record])
        await repository.failDetail(onCall: 1, with: .unavailable)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.transactionDetail(id: record.id)
        }
        #expect(try await repository.transactionDetail(id: record.id) == record)
    }

    @Test("purchase pages are served in order and the last one terminates")
    func purchasePagesTerminate() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 3), pageSize: 2)

        let first = try await repository.purchases(after: nil)
        #expect(first.purchases.map(\.id) == ["purchase-0", "purchase-1"])
        let cursor = try #require(first.nextCursor)

        let second = try await repository.purchases(after: cursor)
        #expect(second.purchases.map(\.id) == ["purchase-2"])
        #expect(second.nextCursor == nil)
    }

    @Test("an empty purchase repository returns an empty last page")
    func emptyPurchaseRepository() async throws {
        let page = try await InMemoryPurchasesRepository().purchases(after: nil)

        #expect(page.purchases.isEmpty)
        #expect(page.nextCursor == nil)
    }

    @Test("a purchase page ending exactly at the boundary has no next cursor")
    func exactPurchasePageBoundary() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 2), pageSize: 2)

        let page = try await repository.purchases(after: nil)

        #expect(page.purchases.count == 2)
        #expect(page.nextCursor == nil)
    }

    @Test("purchase page calls are counted")
    func purchaseCallsAreCounted() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 3), pageSize: 2)

        let cursor = try #require(try await repository.purchases(after: nil).nextCursor)
        _ = try await repository.purchases(after: cursor)

        #expect(await repository.callCount == 2)
    }

    @Test("the first purchase call can fail as configured")
    func purchaseFailureIsInjectable() async {
        let repository = InMemoryPurchasesRepository(rows: Purchase.fakes(count: 1))
        await repository.fail(onCall: 1, with: .unavailable)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.purchases(after: nil)
        }
    }

    @Test("a purchase cursor the repository never minted is rejected")
    func purchaseRejectsInventedCursor() async {
        let repository = InMemoryPurchasesRepository(rows: Purchase.fakes(count: 2))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchases(after: "not-a-cursor")
        }
    }

    @Test("a purchase offset derived by a caller is rejected")
    func purchaseRejectsDerivedCursor() async {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 4), pageSize: 2)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchases(after: "2")
        }
    }

    @Test("a purchase cursor held across replacement is rejected")
    func purchaseRejectsCursorHeldAcrossReplacement() async throws {
        let repository = InMemoryPurchasesRepository(
            rows: Purchase.fakes(count: 4), pageSize: 2)
        let cursor = try #require(try await repository.purchases(after: nil).nextCursor)

        await repository.replace(with: Purchase.fakes(count: 4))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchases(after: cursor)
        }
    }

    @Test("replacing purchases changes the next first page")
    func purchaseReplacementIsRead() async throws {
        let repository = InMemoryPurchasesRepository(rows: Purchase.fakes(count: 2))

        await repository.replace(with: [.fake(id: "purchase-new")])
        let page = try await repository.purchases(after: nil)

        #expect(page.purchases.map(\.id) == ["purchase-new"])
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

    @Test("the receipt capture fake answers the default extraction when nothing is configured")
    func receiptCaptureFakeDefaultOutcome() async throws {
        let repository = InMemoryReceiptCaptureRepository(
            defaultExtraction: .unreadable(receiptCount: 1, reason: "no fixture"))

        let outcome = try await repository.extract([ReceiptPart.fake()])

        #expect(outcome == .unreadable(receiptCount: 1, reason: "no fixture"))
        #expect(await repository.extractCallCount == 1)
    }

    @Test("a configured extraction answers the call it names")
    func receiptCaptureFakeConfiguredOutcome() async throws {
        let repository = InMemoryReceiptCaptureRepository()
        await repository.respond(onCall: 1, with: .unreadable(receiptCount: 1, reason: "blurred"))

        let outcome = try await repository.extract([ReceiptPart.fake()])

        #expect(outcome == .unreadable(receiptCount: 1, reason: "blurred"))
    }

    @Test("a receipt extraction failure can be injected, and only on the call it names")
    func receiptCaptureFakeInjectsFailure() async throws {
        let repository = InMemoryReceiptCaptureRepository(
            defaultExtraction: .unreadable(receiptCount: 1, reason: "blurred"))
        await repository.failExtract(onCall: 1, with: .unavailable)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.extract([ReceiptPart.fake()])
        }
        let outcome = try await repository.extract([ReceiptPart.fake()])
        #expect(outcome == .unreadable(receiptCount: 1, reason: "blurred"))
    }

    @Test("the receipt capture fake records what it was sent, per call")
    func receiptCaptureFakeRecordsParts() async throws {
        let repository = InMemoryReceiptCaptureRepository()
        let firstParts = [ReceiptPart.fake(mediaType: .png)]
        let secondParts = [ReceiptPart.fake(mediaType: .jpeg), ReceiptPart.fake(mediaType: .pdf)]

        _ = try await repository.extract(firstParts)
        _ = try await repository.extract(secondParts)

        #expect(await repository.extracted == [firstParts, secondParts])
        #expect(await repository.extractCallCount == 2)
    }

    @Test("saveDraft answers the configured result and records the payload")
    func receiptCaptureFakeSaveDraft() async throws {
        let repository = InMemoryReceiptCaptureRepository()
        await repository.respondToSave(with: .success(.fake(id: "purchase-1")))
        let payload = ReceiptDraftSavePayload.fake()

        let purchase = try await repository.saveDraft(payload)

        #expect(purchase == .fake(id: "purchase-1"))
        #expect(await repository.savedDrafts == [payload])
    }

    @Test("createManualPurchase answers the configured result and records the payload")
    func receiptCaptureFakeManualPurchase() async throws {
        let repository = InMemoryReceiptCaptureRepository()
        await repository.respondToManualPurchase(with: .success(.fake(id: "purchase-2")))
        let payload = ReceiptManualPurchasePayload.fake()

        let purchase = try await repository.createManualPurchase(payload)

        #expect(purchase == .fake(id: "purchase-2"))
        #expect(await repository.manualPurchases == [payload])
    }
}
