import Foundation
import Testing

@testable import AppCore

@MainActor
internal final class TripOfflineReadFixture {
    internal let owner: TripDocumentOfflineOwner
    internal var current: TripDocumentOfflineOwner
    internal let verifiedAt = Date(timeIntervalSince1970: 1_790_000_000)
    internal let store: OfflineNavigationMemoryStore
    internal let remote = OfflineControlledReader()

    internal init() throws {
        let device = PairedDevice(
            id: "phone", baseURL: try #require(URL(string: "https://owner.example")),
            credentialRevision: 1)
        owner = TripDocumentOfflineOwner(device: device)
        current = owner
        store = OfflineNavigationMemoryStore(owner: owner)
        remote.catalogue = .success([Self.snapshot().trip])
        remote.detail = .success(Self.snapshot())
    }

    internal func context() -> TripOfflineReadContext {
        TripOfflineReadContext { self.current == self.owner }
    }

    internal func coordinator(context: TripOfflineReadContext? = nil) -> TripOfflineReadCoordinator
    {
        TripOfflineReadCoordinator(
            trips: remote, documents: remote, store: store, context: context ?? self.context(),
            now: { self.verifiedAt })
    }

    internal static func snapshot(id: Int = 7, name: String = "Trip") -> TripSnapshot {
        TripSnapshot(
            trip: TripRecord(
                id: id, name: name, destination: "", when: "after summer", tagId: nil,
                parentId: nil, notes: "", sourceLinks: []),
            places: [], visits: [], journeys: [], journeyGroups: [], stays: [], events: [],
            documentAssociations: [])
    }

    internal static func document(id: Int = 12) -> DocumentOriginal {
        DocumentOriginal(
            id: id, title: "Ticket", created: "", originalFileName: "ticket.pdf", thumbnailUrl: "")
    }
}

@MainActor
internal final class OfflineNavigationMemoryStore: TripDocumentOfflineStore {
    internal let owner: TripDocumentOfflineOwner
    internal var value: TripDocumentOfflineNavigation?
    internal var failReplacement = false

    internal init(owner: TripDocumentOfflineOwner) { self.owner = owner }
    internal func loadNavigation() throws -> TripDocumentOfflineNavigation? { value }
    internal func replaceNavigation(
        _ value: TripDocumentOfflineNavigation, replacing generation: UUID?
    ) throws {
        if failReplacement { throw CocoaError(.fileWriteNoPermission) }
        guard self.value?.generation == generation else {
            throw TripDocumentOfflineError.generationChanged
        }
        self.value = value
    }
    internal func original(id: Int) throws -> TripOfflineFileRecord? { nil }
    internal func originalGeneration(id: Int) throws -> UUID? { nil }
    internal func retainOriginal(
        _ download: DownloadedDocument, id: Int, verifiedAt: Date, replacing generation: UUID?
    ) throws -> TripOfflineFileRecord { throw TripDocumentOfflineError.invalidRecord }
    internal func previewOriginal(id: Int) throws -> DownloadedDocument? { nil }
}

@MainActor
internal final class OfflineControlledReader: TripsReading, DocumentsReading {
    internal var catalogue: Result<[TripRecord], RepositoryError> = .success([])
    internal var detail: Result<TripSnapshot?, RepositoryError> = .success(nil)
    internal var metadata: Result<DocumentOriginal?, RepositoryError> = .success(nil)
    internal var fileFailure: any Error = RepositoryError.unavailable
    internal var deferDetails = false
    internal let started = AsyncStream<Void>.makeStream()
    internal var pending: [CheckedContinuation<TripSnapshot?, any Error>] = []
    internal private(set) var calls = 0

    internal func trips() async throws -> [TripRecord] {
        calls += 1
        return try catalogue.get()
    }
    internal func trip(id: Int) async throws -> TripSnapshot? {
        calls += 1
        if deferDetails {
            return try await withCheckedThrowingContinuation { continuation in
                pending.append(continuation)
                started.continuation.yield(())
            }
        }
        return try detail.get()
    }
    internal func document(id: Int) async throws -> DocumentOriginal? {
        calls += 1
        return try metadata.get()
    }
    internal func file(id: Int) async throws -> DownloadedDocument {
        calls += 1
        throw fileFailure
    }
}
