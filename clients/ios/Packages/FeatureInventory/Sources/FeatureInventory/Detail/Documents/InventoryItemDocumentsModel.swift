import AppCore
import Foundation
import Observation
import UniformTypeIdentifiers

/// A file this app owns, picked or scanned and waiting for a kind and title.
internal struct InventoryPickedDocument: Identifiable, Equatable {
    internal let fileURL: URL
    internal let mimeType: String
    internal let fileName: String
    internal let byteCount: Int

    internal var id: URL { fileURL }

    /// Describes a file on disk by its name: the MIME type from its
    /// extension, the size from the file system.
    internal static func describe(_ fileURL: URL) throws -> InventoryPickedDocument {
        let size = try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        let mimeType =
            UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        return InventoryPickedDocument(
            fileURL: fileURL, mimeType: mimeType, fileName: fileURL.lastPathComponent,
            byteCount: size)
    }

    /// Drops the file and the directory it was staged in.
    internal func discard() {
        try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent())
    }
}

/// An item's Paperless documents, read online and edited in place.
///
/// The section never waits on the server to draw: until the first read
/// answers it shows the list this item last showed, or the replica's titles,
/// and it keeps them when the server cannot answer.
@MainActor @Observable
internal final class InventoryItemDocumentsModel {
    internal let itemId: InventoryItem.ID
    private let replica: InventoryDocumentsStatus
    private let service: any InventoryDocumentsService
    private let cache: InventoryDocumentCache
    private var answer: Result<InventoryItemDocuments, any Error>?
    private var snapshot: InventoryItemDocuments?

    /// The file QuickLook is showing.
    internal var preview: URL?
    /// Why the last action did not happen, in words fit to show.
    internal var message: String?
    /// A file picked and waiting for its kind and title.
    internal var staged: InventoryPickedDocument?
    /// The document an Unlink confirmation is asking about.
    internal var unlinking: InventoryLinkedDocument?
    /// The document the edit sheet is renaming.
    internal var editing: InventoryLinkedDocument?
    /// Rows that could not be opened, and why.
    internal private(set) var rowNotes: [InventoryDocumentRow.ID: String] = [:]
    internal private(set) var opening: InventoryDocumentRow.ID?
    /// Bumped by an upload so the polling task restarts for the new row.
    internal private(set) var watchGeneration = 0

    internal init(
        itemId: InventoryItem.ID, replica: InventoryDocumentsStatus,
        service: any InventoryDocumentsService, cache: InventoryDocumentCache = .standard
    ) {
        self.itemId = itemId
        self.replica = replica
        self.service = service
        self.cache = cache
        snapshot = cache.snapshot(of: itemId)
    }

    internal var state: InventoryDocumentsSectionState {
        InventoryDocumentsSectionState.make(answer: answer, snapshot: snapshot, replica: replica)
    }

    private var limits: InventoryDocumentUploadLimits? {
        (try? answer?.get())?.limits ?? snapshot?.limits
    }

    internal func load() async {
        do {
            let documents = try await service.documents(of: itemId)
            answer = .success(documents)
            snapshot = documents
            cache.saveSnapshot(documents, of: itemId)
        } catch is CancellationError {
            return
        } catch {
            answer = .failure(error)
        }
    }

    /// Reads, then reads again every `interval` while a row is processing,
    /// returning once none is. Cancelled with the view that runs it, so it
    /// polls only while the section is on screen.
    internal func watch(
        every interval: Duration = .seconds(5),
        sleep: @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) async {
        await load()
        while state.hasPending, !Task.isCancelled {
            do {
                try await sleep(interval)
            } catch {
                return
            }
            await load()
        }
    }

    internal func open(_ row: InventoryDocumentRow) async {
        guard let document = row.linkedDocument, opening == nil else { return }
        opening = row.id
        defer { opening = nil }
        do {
            preview = try await InventoryDocumentOpener(service: service, cache: cache)
                .open(document.id)
            rowNotes[row.id] = nil
        } catch is CancellationError {
            return
        } catch InventoryDocumentsError.needsConnection {
            rowNotes[row.id] = InventoryDocumentCopy.needsConnection
        } catch {
            message = InventoryDocumentCopy.message(for: error)
        }
    }

    /// Holds a picked file for its kind and title, unless the limits the
    /// last list reported already refuse it. Returns whether it was held.
    @discardableResult
    internal func stage(_ picked: InventoryPickedDocument) -> Bool {
        if let refusal = limits?.refusal(byteCount: picked.byteCount, mimeType: picked.mimeType) {
            picked.discard()
            message = InventoryDocumentCopy.message(for: refusal)
            return false
        }
        staged = picked
        return true
    }

    internal func cancelStaged() {
        staged?.discard()
        staged = nil
    }

    /// Takes the staged file for upload at once, so the sheet's dismissal
    /// finds nothing left to discard, and uploads it.
    internal func commitStaged(kind: InventoryDocumentKind, title: String) {
        guard let picked = staged else { return }
        staged = nil
        Task { await attach(picked, kind: kind, title: title) }
    }

    /// Uploads `picked`, then drops the file. A pending row appears as soon
    /// as the server accepts it; an upload that cannot reach the server is
    /// refused, not queued.
    internal func attach(
        _ picked: InventoryPickedDocument, kind: InventoryDocumentKind, title: String
    ) async {
        defer { picked.discard() }
        let upload = InventoryDocumentUpload(
            fileURL: picked.fileURL, mimeType: picked.mimeType, fileName: picked.fileName,
            byteCount: picked.byteCount, kind: kind, title: title)
        do {
            let ingestion = try await service.upload(upload, to: itemId)
            show(adding: ingestion)
            watchGeneration += 1
        } catch InventoryDocumentsError.offline {
            message = InventoryDocumentCopy.uploadOffline
        } catch {
            message = InventoryDocumentCopy.message(for: error)
        }
    }

    /// Sends only what differs from `document`; nothing at all when nothing does.
    internal func edit(
        _ document: InventoryLinkedDocument, kind: InventoryDocumentKind, title: String
    ) async {
        guard let edit = InventoryDocumentEdit.changes(to: document, kind: kind, title: title)
        else { return }
        await perform { try await self.service.updateDocument(document.id, edit) }
    }

    internal func requestUnlink(_ document: InventoryLinkedDocument) {
        unlinking = document
    }

    internal func cancelUnlink() {
        unlinking = nil
    }

    internal func confirmUnlink() async {
        guard let document = unlinking else { return }
        unlinking = nil
        await perform {
            try await self.service.unlinkDocument(document.id)
            self.cache.remove(document.id)
        }
    }

    internal func dismiss(_ ingestion: InventoryDocumentIngestion) async {
        await perform { try await self.service.dismissIngestion(ingestion.id) }
    }

    private func perform(_ write: () async throws -> Void) async {
        do {
            try await write()
        } catch {
            message = InventoryDocumentCopy.message(for: error)
        }
        await load()
    }

    private func show(adding ingestion: InventoryDocumentIngestion) {
        let current =
            (try? answer?.get()) ?? snapshot
            ?? InventoryItemDocuments(
                limits: InventoryDocumentUploadLimits(maxUploadBytes: nil, allowedMimeTypes: nil),
                linked: [], pending: [], failed: [])
        let documents = InventoryItemDocuments(
            limits: current.limits, linked: current.linked,
            pending: current.pending + [ingestion], failed: current.failed)
        answer = .success(documents)
        snapshot = documents
    }
}
