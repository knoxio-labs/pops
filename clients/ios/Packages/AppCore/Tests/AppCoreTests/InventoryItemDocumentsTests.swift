import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("Inventory item documents")
internal struct InventoryItemDocumentsTests {
    private static let documentsLimits = InventoryDocumentUploadLimits(
        maxUploadBytes: 1000, allowedMimeTypes: ["application/pdf", "image/*", "text/*"])

    @Test("a file over the cap is refused, one at the cap is not")
    func oversize() {
        #expect(
            Self.documentsLimits.refusal(byteCount: 1001, mimeType: "application/pdf")
                == .tooLarge(maxUploadBytes: 1000))
        #expect(Self.documentsLimits.refusal(byteCount: 1000, mimeType: "application/pdf") == nil)
    }

    @Test("a scanned PDF, a photo and plain text pass; a Word file does not")
    func mimeTypes() {
        #expect(Self.documentsLimits.refusal(byteCount: 1, mimeType: "application/pdf") == nil)
        #expect(Self.documentsLimits.refusal(byteCount: 1, mimeType: "image/jpeg") == nil)
        #expect(Self.documentsLimits.refusal(byteCount: 1, mimeType: "TEXT/plain") == nil)
        #expect(
            Self.documentsLimits.refusal(
                byteCount: 1,
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                == .unsupportedType)
        #expect(
            Self.documentsLimits.refusal(byteCount: 1, mimeType: "application/pdfx")
                == .unsupportedType)
    }

    @Test("unknown limits refuse nothing")
    func unknownLimits() {
        let limits = InventoryDocumentUploadLimits(maxUploadBytes: nil, allowedMimeTypes: nil)
        #expect(limits.refusal(byteCount: Int.max, mimeType: "application/zip") == nil)
    }

    @Test("an edit holds only the key that changed")
    func editHoldsChangedKeyOnly() {
        let document = InventoryLinkedDocument(
            id: 1, paperlessDocumentId: 9, kind: .receipt, title: "Receipt", presence: .present)

        #expect(
            InventoryDocumentEdit.changes(to: document, kind: .receipt, title: " Till slip ")
                == InventoryDocumentEdit(kind: nil, title: "Till slip"))
        #expect(
            InventoryDocumentEdit.changes(to: document, kind: .warranty, title: "Receipt")
                == InventoryDocumentEdit(kind: .warranty, title: nil))
        #expect(
            InventoryDocumentEdit.changes(to: document, kind: .receipt, title: "Receipt") == nil)
        #expect(InventoryDocumentEdit.changes(to: document, kind: .receipt, title: "   ") == nil)
    }

    @Test("a title past Paperless's limit is cut to it")
    func titleLimit() throws {
        let document = InventoryLinkedDocument(
            id: 1, paperlessDocumentId: 9, kind: .manual, title: nil, presence: .unknown)
        let edit = try #require(
            InventoryDocumentEdit.changes(
                to: document, kind: .manual, title: String(repeating: "a", count: 200)))
        #expect(edit.title?.count == InventoryDocumentEdit.titleLimit)
    }

    @Test("an unknown wire kind reads as other")
    func unknownKind() {
        #expect(InventoryDocumentKind(wire: "contract") == .other)
        #expect(InventoryDocumentKind(wire: "warranty") == .warranty)
    }

    @Test(
        "the open decision",
        arguments: [
            (Int?.none, Int?.some(10), InventoryDocumentOpenDecision.download),
            (Int?.some(10), Int?.some(10), .openCached),
            (Int?.some(9), Int?.some(10), .download),
            (Int?.some(10), Int?.none, .openCached),
            (Int?.none, Int?.none, .needsConnection),
        ])
    func decision(cached: Int?, remote: Int?, expected: InventoryDocumentOpenDecision) {
        #expect(
            InventoryDocumentOpenDecision.decide(cachedByteCount: cached, remoteByteCount: remote)
                == expected)
    }

    @Test("the unbound service answers unavailable rather than trapping")
    func unbound() async {
        await #expect(throws: InventoryDocumentsError.unavailable) {
            _ = try await UnboundInventoryDocumentsService().documents(of: "drill")
        }
    }

    @Test("a gone link is not treated as unreachable")
    func goneIsNotUnreachable() {
        #expect(!InventoryDocumentOpenDecision.isUnreachable(InventoryDocumentsError.notFound))
        #expect(InventoryDocumentOpenDecision.isUnreachable(InventoryDocumentsError.offline))
        #expect(InventoryDocumentOpenDecision.isUnreachable(RepositoryError.unavailable))
    }
}

@Suite("Inventory document opener")
internal struct InventoryDocumentOpenerTests {
    private let cache: InventoryDocumentCache
    private let root: URL

    init() {
        root = FileManager.default.temporaryDirectory.appending(path: "doc-cache-\(UUID())")
        cache = InventoryDocumentCache(root: root)
    }

    @Test("the first open downloads, the second reuses the copy")
    func cacheMissThenHit() async throws {
        let service = InMemoryInventoryDocumentsService(files: [7: Data("receipt".utf8)])
        let opener = InventoryDocumentOpener(service: service, cache: cache)

        let first = try await opener.open(7)
        let second = try await opener.open(7)

        #expect(first == second)
        #expect(first.pathExtension == "pdf")
        #expect(try Data(contentsOf: first) == Data("receipt".utf8))
        #expect(await service.downloads == 1)
    }

    @Test("a copy whose size no longer matches is downloaded again")
    func staleCopy() async throws {
        let service = InMemoryInventoryDocumentsService(files: [7: Data("v1".utf8)])
        let opener = InventoryDocumentOpener(service: service, cache: cache)
        _ = try await opener.open(7)

        await service.setFile(Data("version two".utf8), for: 7)
        let url = try await opener.open(7)

        #expect(try Data(contentsOf: url) == Data("version two".utf8))
        #expect(await service.downloads == 2)
    }

    @Test("offline with a copy opens the copy")
    func offlineWithCopy() async throws {
        let service = InMemoryInventoryDocumentsService(files: [7: Data("receipt".utf8)])
        let opener = InventoryDocumentOpener(service: service, cache: cache)
        let online = try await opener.open(7)

        await service.setFailure(.offline)
        let offline = try await opener.open(7)

        #expect(offline == online)
        #expect(await service.downloads == 1)
    }

    @Test("offline without a copy needs a connection")
    func offlineWithoutCopy() async {
        let service = InMemoryInventoryDocumentsService(files: [7: Data("receipt".utf8)])
        await service.setFailure(.offline)
        let opener = InventoryDocumentOpener(service: service, cache: cache)

        await #expect(throws: InventoryDocumentsError.needsConnection) {
            try await opener.open(7)
        }
        #expect(await service.downloads == 0)
    }

    @Test("a link the server no longer has drops its copy")
    func goneLinkDropsCopy() async throws {
        let service = InMemoryInventoryDocumentsService(files: [7: Data("receipt".utf8)])
        let opener = InventoryDocumentOpener(service: service, cache: cache)
        _ = try await opener.open(7)

        await service.setFailure(.notFound)
        await #expect(throws: InventoryDocumentsError.notFound) { try await opener.open(7) }
        #expect(cache.file(for: 7) == nil)
    }

    @Test("a snapshot round-trips")
    func snapshot() {
        let documents = InventoryItemDocuments(
            limits: InventoryDocumentUploadLimits(maxUploadBytes: 5, allowedMimeTypes: ["image/*"]),
            linked: [
                InventoryLinkedDocument(
                    id: 1, paperlessDocumentId: 2, kind: .manual, title: nil, presence: .missing)
            ],
            pending: [], failed: [])
        cache.saveSnapshot(documents, of: "item/1")
        #expect(cache.snapshot(of: "item/1") == documents)
        #expect(cache.snapshot(of: "item-2") == nil)
    }
}
