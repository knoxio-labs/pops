import AppCore
import Foundation
import Observation

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
    /// Rows that could not be opened, and why.
    internal private(set) var rowNotes: [InventoryDocumentRow.ID: String] = [:]
    internal private(set) var opening: InventoryDocumentRow.ID?

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
}
