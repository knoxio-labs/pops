import AppCore
import Foundation

/// An `InventoryDocumentsService` held in memory, recording every write and
/// every read so a test can say what reached the server and how often.
public actor InMemoryInventoryDocumentsService: InventoryDocumentsService {
    /// One write, as the server would have received it.
    public enum Write: Hashable, Sendable {
        case update(InventoryLinkedDocument.ID, InventoryDocumentEdit)
        case unlink(InventoryLinkedDocument.ID)
        case dismiss(InventoryDocumentIngestion.ID)
        case upload(InventoryDocumentUpload, itemId: InventoryItem.ID)
    }

    private var lists: [InventoryItem.ID: InventoryItemDocuments]
    private var files: [InventoryLinkedDocument.ID: Data]
    private var nextId = 1000
    /// Thrown by every read and write while set.
    public private(set) var failure: InventoryDocumentsError?
    /// Each list read pops the next answer here, before the stored list.
    private var scriptedLists: [InventoryItemDocuments] = []
    public private(set) var writes: [Write] = []
    public private(set) var listReads = 0
    public private(set) var downloads = 0

    /// - Parameters:
    ///   - lists: Each item's documents.
    ///   - files: Each link's file bytes.
    public init(
        lists: [InventoryItem.ID: InventoryItemDocuments] = [:],
        files: [InventoryLinkedDocument.ID: Data] = [:]
    ) {
        self.lists = lists
        self.files = files
    }

    public func setFailure(_ failure: InventoryDocumentsError?) {
        self.failure = failure
    }

    public func setFile(_ data: Data, for id: InventoryLinkedDocument.ID) {
        files[id] = data
    }

    /// Answers the next list reads with `answers`, in order, then the stored list.
    public func script(_ answers: [InventoryItemDocuments]) {
        scriptedLists = answers
    }

    public func documents(of itemId: InventoryItem.ID) async throws -> InventoryItemDocuments {
        listReads += 1
        if let failure { throw failure }
        if !scriptedLists.isEmpty { return scriptedLists.removeFirst() }
        return lists[itemId] ?? Self.empty
    }

    public func updateDocument(_ id: InventoryLinkedDocument.ID, _ edit: InventoryDocumentEdit)
        async throws
    {
        if let failure { throw failure }
        writes.append(.update(id, edit))
        for (itemId, list) in lists {
            let linked = list.linked.map { document in
                guard document.id == id else { return document }
                return InventoryLinkedDocument(
                    id: id, paperlessDocumentId: document.paperlessDocumentId,
                    kind: edit.kind ?? document.kind, title: edit.title ?? document.title,
                    presence: document.presence)
            }
            lists[itemId] = InventoryItemDocuments(
                limits: list.limits, linked: linked, pending: list.pending, failed: list.failed)
        }
    }

    public func unlinkDocument(_ id: InventoryLinkedDocument.ID) async throws {
        if let failure { throw failure }
        writes.append(.unlink(id))
        for (itemId, list) in lists {
            lists[itemId] = InventoryItemDocuments(
                limits: list.limits, linked: list.linked.filter { $0.id != id },
                pending: list.pending, failed: list.failed)
        }
    }

    public func dismissIngestion(_ id: InventoryDocumentIngestion.ID) async throws {
        if let failure { throw failure }
        writes.append(.dismiss(id))
        for (itemId, list) in lists {
            lists[itemId] = InventoryItemDocuments(
                limits: list.limits, linked: list.linked, pending: list.pending,
                failed: list.failed.filter { $0.id != id })
        }
    }

    public func upload(_ upload: InventoryDocumentUpload, to itemId: InventoryItem.ID)
        async throws -> InventoryDocumentIngestion
    {
        if let failure { throw failure }
        writes.append(.upload(upload, itemId: itemId))
        nextId += 1
        let ingestion = InventoryDocumentIngestion(
            id: nextId, kind: upload.kind, title: upload.title, fileName: upload.fileName,
            state: .pending, reason: nil)
        let list = lists[itemId] ?? Self.empty
        lists[itemId] = InventoryItemDocuments(
            limits: list.limits, linked: list.linked, pending: list.pending + [ingestion],
            failed: list.failed)
        return ingestion
    }

    public func fileVersion(of id: InventoryLinkedDocument.ID) async throws
        -> InventoryDocumentFileVersion
    {
        if let failure { throw failure }
        guard let data = files[id] else { throw InventoryDocumentsError.notFound }
        return Self.version(of: data)
    }

    public func downloadFile(of id: InventoryLinkedDocument.ID) async throws -> (
        temporaryURL: URL, version: InventoryDocumentFileVersion
    ) {
        if let failure { throw failure }
        guard let data = files[id] else { throw InventoryDocumentsError.notFound }
        downloads += 1
        let url = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try data.write(to: url)
        return (url, Self.version(of: data))
    }

    private static func version(of data: Data) -> InventoryDocumentFileVersion {
        InventoryDocumentFileVersion(
            byteCount: data.count, contentType: "application/pdf", fileName: "document.pdf")
    }

    private static let empty = InventoryItemDocuments(
        limits: InventoryDocumentUploadLimits(maxUploadBytes: nil, allowedMimeTypes: nil),
        linked: [], pending: [], failed: [])
}
