import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

internal enum DocumentFixture {
    static let limits = InventoryDocumentUploadLimits(
        maxUploadBytes: 1000, allowedMimeTypes: ["application/pdf", "image/*", "text/*"])
    static let warranty = InventoryLinkedDocument(
        id: 3, paperlessDocumentId: 41, kind: .warranty, title: "Warranty card", presence: .present)
    static let manual = InventoryLinkedDocument(
        id: 4, paperlessDocumentId: 42, kind: .manual, title: nil, presence: .missing)
    static let pending = InventoryDocumentIngestion(
        id: 8, kind: .receipt, title: nil, fileName: "scan.pdf", state: .pending, reason: nil)
    static let failed = InventoryDocumentIngestion(
        id: 9, kind: .invoice, title: "Invoice", fileName: "i.pdf", state: .failed,
        reason: "Paperless could not read it")

    static func documents(
        linked: [InventoryLinkedDocument] = [warranty], pending: [InventoryDocumentIngestion] = [],
        failed: [InventoryDocumentIngestion] = []
    ) -> InventoryItemDocuments {
        InventoryItemDocuments(limits: limits, linked: linked, pending: pending, failed: failed)
    }

    static func cache() -> InventoryDocumentCache {
        InventoryDocumentCache(
            root: FileManager.default.temporaryDirectory.appending(path: "docs-\(UUID())"))
    }

    @MainActor
    static func model(
        _ service: InMemoryInventoryDocumentsService, cache: InventoryDocumentCache = cache()
    ) -> InventoryItemDocumentsModel {
        InventoryItemDocumentsModel(itemId: "drill", replica: .none, service: service, cache: cache)
    }

    static func service(
        _ documents: InventoryItemDocuments = documents()
    ) -> InMemoryInventoryDocumentsService {
        InMemoryInventoryDocumentsService(
            lists: ["drill": documents], files: [3: Data("warranty".utf8)])
    }
}

@Suite("Documents section states")
internal struct InventoryDocumentsSectionStateTests {
    private typealias Fixture = DocumentFixture

    @Test("no documents is an empty section that can still add one")
    func none() {
        let state = InventoryDocumentsSectionState.make(
            answer: .success(Fixture.documents(linked: [])), snapshot: nil, replica: .none)
        #expect(state.rows.isEmpty)
        #expect(state.notice == nil)
        #expect(state.canAdd)
        #expect(!state.isHidden)
    }

    @Test("linked, missing, processing and refused rows, in that order")
    func linked() {
        let state = InventoryDocumentsSectionState.make(
            answer: .success(
                Fixture.documents(
                    linked: [Fixture.warranty, Fixture.manual], pending: [Fixture.pending],
                    failed: [Fixture.failed])),
            snapshot: nil, replica: .none)

        #expect(state.rows.map(\.title) == ["Warranty card", "Manual", "scan.pdf", "Invoice"])
        #expect(state.rows.map(\.id) == ["link-3", "link-4", "ingestion-8", "ingestion-9"])
        #expect(state.rows[0].status == .linked(Fixture.warranty))
        #expect(state.rows[1].status == .missing(Fixture.manual))
        #expect(state.rows[2].status == .processing(Fixture.pending))
        #expect(state.rows[3].status == .failed(Fixture.failed))
        #expect(state.hasPending)
    }

    @Test(
        "Paperless not connected or down shows the notice and offers no upload",
        arguments: [InventoryDocumentsError.paperlessNotConnected, .unavailable])
    func paperlessUnavailable(error: InventoryDocumentsError) {
        let state = InventoryDocumentsSectionState.make(
            answer: .failure(error), snapshot: Fixture.documents(), replica: .none)
        #expect(state.notice == .paperlessUnavailable)
        #expect(!state.canAdd)
        #expect(state.rows.map(\.id) == ["link-3"])
    }

    @Test("offline keeps the last list this item showed")
    func offlineWithSnapshot() {
        let state = InventoryDocumentsSectionState.make(
            answer: .failure(InventoryDocumentsError.offline), snapshot: Fixture.documents(),
            replica: .linked(["Stale title"]))
        #expect(state.rows.map(\.id) == ["link-3"])
        #expect(state.notice == nil)
    }

    @Test("offline with no list falls back to the replica's titles, which cannot open")
    func offlineWithReplica() {
        let state = InventoryDocumentsSectionState.make(
            answer: .failure(InventoryDocumentsError.offline), snapshot: nil,
            replica: .linked(["Receipt"]))
        #expect(state.rows.map(\.title) == ["Receipt"])
        #expect(state.rows.first?.status == .titleOnly)
        #expect(state.rows.first?.linkedDocument == nil)
    }

    @Test("before the first answer, an item with nothing known draws nothing")
    func loadingWithNothing() {
        #expect(
            InventoryDocumentsSectionState.make(answer: nil, snapshot: nil, replica: .none)
                .isHidden)
        #expect(
            !InventoryDocumentsSectionState.make(
                answer: nil, snapshot: nil, replica: .linked(["Receipt"])
            ).isHidden)
    }
}

@MainActor
@Suite("Documents on the item page")
internal struct InventoryItemDocumentsModelTests {
    private typealias Fixture = DocumentFixture

    private static func model(
        _ service: InMemoryInventoryDocumentsService,
        cache: InventoryDocumentCache = Fixture.cache()
    ) -> InventoryItemDocumentsModel {
        Fixture.model(service, cache: cache)
    }

    private static func service() -> InMemoryInventoryDocumentsService { Fixture.service() }

    @Test("opening downloads once, then opens the cached copy")
    func opensAndReuses() async throws {
        let service = Self.service()
        let model = Self.model(service)
        await model.load()
        let row = try #require(model.state.rows.first)

        await model.open(row)
        let first = try #require(model.preview)
        model.preview = nil
        await model.open(row)

        #expect(model.preview == first)
        #expect(await service.downloads == 1)
    }

    @Test("offline with a cached copy opens it; without one the row needs a connection")
    func offline() async throws {
        let cache = Fixture.cache()
        let service = Self.service()
        let model = Self.model(service, cache: cache)
        await model.load()
        let row = try #require(model.state.rows.first)
        await model.open(row)
        model.preview = nil

        await service.setFailure(.offline)
        await model.open(row)
        #expect(model.preview != nil)
        #expect(model.rowNotes[row.id] == nil)

        cache.remove(3)
        model.preview = nil
        await model.open(row)
        #expect(model.preview == nil)
        #expect(model.rowNotes[row.id] == InventoryDocumentCopy.needsConnection)
        #expect(model.message == nil)
    }

    @Test("polling reads again while a row is processing and stops when none is")
    func pollingStops() async {
        let service = Self.service()
        await service.script([
            Fixture.documents(pending: [Fixture.pending]),
            Fixture.documents(pending: [Fixture.pending]),
            Fixture.documents(),
        ])
        let model = Self.model(service)
        let sleeps = SleepRecorder()

        await model.watch(every: .seconds(5)) { await sleeps.record($0) }

        #expect(await service.listReads == 3)
        #expect(await sleeps.all == [.seconds(5), .seconds(5)])
        #expect(!model.state.hasPending)
    }

    @Test("with nothing processing, polling reads once and never sleeps")
    func noPolling() async {
        let service = Self.service()
        let model = Self.model(service)
        let sleeps = SleepRecorder()

        await model.watch { await sleeps.record($0) }

        #expect(await service.listReads == 1)
        #expect(await sleeps.all.isEmpty)
    }

    @Test("a read that fails keeps the list this item showed last time")
    func snapshotSurvivesFailure() async {
        let cache = Fixture.cache()
        let service = Self.service()
        await Self.model(service, cache: cache).load()

        await service.setFailure(.offline)
        let model = Self.model(service, cache: cache)
        #expect(model.state.rows.map(\.id) == ["link-3"])
        await model.load()
        #expect(model.state.rows.map(\.id) == ["link-3"])
    }
}

private actor SleepRecorder {
    private(set) var all: [Duration] = []
    func record(_ duration: Duration) { all.append(duration) }
}
