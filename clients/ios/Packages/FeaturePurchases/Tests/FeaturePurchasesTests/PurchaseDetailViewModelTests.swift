import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase detail model")
@MainActor
internal struct PurchaseDetailViewModelTests {
    @Test("a detail and its thumbnails load in receipt order")
    func loadsDetailAndOrderedThumbnails() async throws {
        let late = DetailGate()
        let detail = PurchaseDetail.fake(receiptURIs: [uri("first"), uri("second")])
        let first = ReceiptImage.fake(data: Data([1]))
        let second = ReceiptImage.fake(data: Data([2]))
        let repository = DetailRepositoryDouble(
            details: [.value(detail)],
            thumbnails: ["first": .gated(late, first), "second": .value(second)])
        let model = self.model(repository)
        let loading = Task { await model.load() }
        await repository.waitForThumbnailCalls(1)
        await late.open()
        await loading.value

        #expect(model.phase == .loaded(detail, refresh: nil))
        #expect(model.receiptPages.map(\.pageIndex) == [0, 1])
        #expect(model.receiptThumbnails == [first, second])
    }

    @Test("a missing detail becomes not found")
    func missingDetail() async {
        let model = model(DetailRepositoryDouble(details: [.value(nil)]))

        await model.load()

        #expect(model.phase == .failed(.notFound))
    }

    @Test(
        "repository errors retain their distinct failure",
        arguments: [
            (RepositoryError.transport("offline"), PurchaseDetailFailure.offline),
            (.unavailable, .unreachable),
            (.unauthorized, .unauthorized),
            (.contractMismatch, .contractMismatch),
            (.dependencyNotBound, .contractMismatch),
        ])
    func mapsFailures(error: RepositoryError, expected: PurchaseDetailFailure) async {
        let model = model(DetailRepositoryDouble(details: [.failure(error)]))

        await model.load()

        #expect(model.phase == .failed(expected))
    }

    @Test("a failed refresh keeps the loaded detail")
    func refreshKeepsContent() async {
        let detail = PurchaseDetail.fake()
        let repository = DetailRepositoryDouble(
            details: [.value(detail), .failure(.unauthorized)])
        let model = model(repository)
        await model.load()

        await model.refresh()

        #expect(model.phase == .loaded(detail, refresh: .unauthorized))
    }

    @Test(
        "terminal failures do not retry",
        arguments: [
            DetailResponse<PurchaseDetail?>.value(nil),
            DetailResponse<PurchaseDetail?>.failure(.unauthorized),
        ])
    func terminalFailureRetryGuard(_ response: DetailResponse<PurchaseDetail?>) async {
        let repository = DetailRepositoryDouble(details: [response])
        let model = model(repository)
        await model.load()

        await model.retry()

        #expect(await repository.counts().details == 1)
    }

    @Test("a cancelled read cannot land after cancellation")
    func cancelledReadDoesNotLand() async {
        let gate = DetailGate()
        let repository = DetailRepositoryDouble(
            details: [.gated(gate, PurchaseDetail.fake())])
        let model = model(repository)
        let loading = Task { await model.load() }
        await repository.waitForDetailCalls(1)

        loading.cancel()
        await gate.open()
        await loading.value

        #expect(model.phase == .loading)
    }

    @Test("a cancelled missing read does not become not found")
    func cancelledMissingReadDoesNotBecomeNotFound() async {
        let gate = DetailGate()
        let repository = DetailRepositoryDouble(details: [.gated(gate, nil)])
        let model = model(repository)
        let loading = Task { await model.load() }
        await repository.waitForDetailCalls(1)

        loading.cancel()
        await gate.open()
        await loading.value

        #expect(model.phase == .loading)
    }

    @Test("an older read cannot replace a newer one")
    func staleReadDoesNotReplaceNewerRead() async {
        let gate = DetailGate()
        let older = PurchaseDetail.fake(purchase: .fake(id: "older"))
        let newer = PurchaseDetail.fake(purchase: .fake(id: "newer"))
        let repository = DetailRepositoryDouble(
            details: [.gated(gate, older), .value(newer)])
        let model = model(repository)
        let stale = Task { await model.load() }
        await repository.waitForDetailCalls(1)

        await model.load()
        await gate.open()
        await stale.value

        #expect(model.phase == .loaded(newer, refresh: nil))
    }

    @Test("a transport failure can retry")
    func transportFailureRetries() async {
        let detail = PurchaseDetail.fake()
        let repository = DetailRepositoryDouble(
            details: [.failure(.transport("offline")), .value(detail)])
        let model = model(repository)
        await model.load()

        await model.retry()

        #expect(model.phase == .loaded(detail, refresh: nil))
        #expect(await repository.counts().details == 2)
    }

    @Test("failed middle thumbnails keep their original receipt indexes")
    func failedThumbnailKeepsOriginalIndex() async {
        let detail = PurchaseDetail.fake(
            receiptURIs: [uri("first"), uri("missing"), uri("third")])
        let first = ReceiptImage.fake(data: Data([1]))
        let third = ReceiptImage.fake(data: Data([3]))
        let repository = DetailRepositoryDouble(
            details: [.value(detail)],
            thumbnails: [
                "first": .value(first), "missing": .failure(.unavailable),
                "third": .value(third),
            ],
            images: ["third": .value(third)])
        let model = model(repository)
        await model.load()

        #expect(model.receiptPages.map(\.pageIndex) == [0, 2])
        await model.openReceipt(at: model.receiptPages[1].pageIndex)
        #expect(await repository.counts().images == ["third"])
        #expect(model.receiptFull == third)
    }

    @Test("the latest full receipt request wins")
    func latestFullReceiptWins() async {
        let oldGate = DetailGate()
        let detail = PurchaseDetail.fake(receiptURIs: [uri("first"), uri("second")])
        let first = ReceiptImage.fake(data: Data([1]))
        let second = ReceiptImage.fake(data: Data([2]))
        let repository = DetailRepositoryDouble(
            details: [.value(detail)],
            images: ["first": .gated(oldGate, first), "second": .value(second)])
        let model = model(repository)
        await model.load()
        let old = Task { await model.openReceipt(at: 0) }
        await repository.waitForImageCalls(1)

        await model.openReceipt(at: 1)
        await oldGate.open()
        await old.value

        #expect(model.openReceiptIndex == 1)
        #expect(model.receiptFull == second)
    }

    @Test("a detail with no documents makes no receipt calls")
    func emptyDocumentsMakeNoReceiptCalls() async {
        let repository = DetailRepositoryDouble(details: [.value(.fake(receiptURIs: []))])
        let model = model(repository)

        await model.load()

        let counts = await repository.counts()
        #expect(counts.thumbnails.isEmpty)
        #expect(counts.images.isEmpty)
        #expect(model.receiptImages(for: .fake(receiptURIs: [])).isEmpty)
    }

    @Test("receipt viewer slots retain missing pages and replace only the selected full image")
    func viewerSlotsPreservePageIdentity() async {
        let firstThumbnail = ReceiptImage.fake(data: Data([1]))
        let thirdThumbnail = ReceiptImage.fake(data: Data([3]))
        let thirdFull = ReceiptImage.fake(data: Data([33]))
        let detail = PurchaseDetail.fake(
            receiptURIs: [uri("first"), uri("missing"), uri("third")])
        let repository = DetailRepositoryDouble(
            details: [.value(detail)],
            thumbnails: [
                "first": .value(firstThumbnail),
                "missing": .failure(.unavailable),
                "third": .value(thirdThumbnail),
            ],
            images: ["third": .value(thirdFull)])
        let model = model(repository)
        await model.load()

        #expect(model.receiptImages(for: detail) == [Data([1]), Data(), Data([3])])

        await model.openReceipt(at: 2)

        #expect(model.receiptImages(for: detail) == [Data([1]), Data(), Data([33])])
    }

    @Test("receipt indexes outside both bounds perform no request")
    func invalidReceiptIndexesDoNothing() async {
        let detail = PurchaseDetail.fake(receiptURIs: [uri("only")])
        let repository = DetailRepositoryDouble(
            details: [.value(detail)],
            images: ["only": .value(.fake(data: Data([1])))])
        let model = model(repository)
        await model.load()

        await model.openReceipt(at: -1)
        await model.openReceipt(at: 1)

        #expect(await repository.counts().images.isEmpty)
        #expect(model.openReceiptIndex == nil)
    }

    private func model(_ repository: DetailRepositoryDouble) -> PurchaseDetailViewModel {
        PurchaseDetailViewModel(
            id: "purchase", dependencies: .fake(purchases: repository))
    }

    private func uri(_ hash: String) -> String { "pops://purchases/receipt/\(hash)" }
}
