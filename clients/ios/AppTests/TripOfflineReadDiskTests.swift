import AppCore
import Foundation
import Testing

@testable import Pops

@Suite("Cold Trip and original reads through the protected store")
@MainActor
internal struct TripOfflineReadDiskTests {
    @Test(
        "fresh readers recover navigation, selection, metadata and exact bytes after explicit unavailability"
    )
    internal func coldReopen() async throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let remote = OfflineDiskReader(fixture: fixture)
        let reader = coordinator(fixture, remote: remote)
        _ = try await reader.trips()
        _ = try await reader.trip(id: 7)
        try reader.selectTrip(7)
        _ = try await reader.document(id: 12)
        let online = try await reader.file(id: 12)
        #expect(try Data(contentsOf: online.temporaryURL) == Data("original bytes".utf8))
        try FileManager.default.removeItem(at: online.temporaryURL)
        remote.unavailable = true
        let restored = coordinator(fixture, remote: remote)
        #expect(try restored.retainedOriginal(id: 12)?.documentID == 12)
        #expect(try restored.selectedTripID() == 7)
        #expect(try await restored.trips() == fixture.navigation().catalogue?.trips)
        #expect(try await restored.trip(id: 7) == fixture.navigation().trips.first?.snapshot)
        #expect(
            try await restored.document(id: 12) == fixture.navigation().originals.first?.original)
        let offline = try await restored.file(id: 12)
        defer { try? FileManager.default.removeItem(at: offline.temporaryURL) }
        #expect(try Data(contentsOf: offline.temporaryURL) == Data("original bytes".utf8))
        #expect(restored.provenance[.file(12)] == .lastVerified(verifiedAt: fixture.verifiedAt))
        #expect(try fixture.store().original(id: 12) != nil)
    }

    @Test("a file404 survives a fresh store instance even though quarantined original bytes remain")
    internal func persistedMissing() async throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let remote = OfflineDiskReader(fixture: fixture)
        let reader = coordinator(fixture, remote: remote)
        let online = try await reader.file(id: 12)
        try FileManager.default.removeItem(at: online.temporaryURL)
        remote.missing = true
        await #expect(throws: DocumentAccessError.notFound) { try await reader.file(id: 12) }
        remote.unavailable = true
        await #expect(throws: RepositoryError.unavailable) {
            try await coordinator(fixture, remote: remote).file(id: 12)
        }
        #expect(try fixture.store().original(id: 12) != nil)
        #expect(try fixture.store().loadNavigation()?.invalidatedResources == [.file(12)])
        #expect(try coordinator(fixture, remote: remote).retainedOriginal(id: 12) == nil)
    }

    @Test("replacement owner rejects a cached original without dispatch or preview adoption")
    internal func replacement() async throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let remote = OfflineDiskReader(fixture: fixture)
        let reader = coordinator(fixture, remote: remote)
        let online = try await reader.file(id: 12)
        try FileManager.default.removeItem(at: online.temporaryURL)
        fixture.current = try TripDocumentOfflineFixture.owner(revision: 2)
        remote.unavailable = true
        let calls = remote.calls
        await #expect(throws: TripDocumentOfflineError.ownerChanged) {
            try await reader.file(id: 12)
        }
        #expect(remote.calls == calls)
        #expect(try fixture.store().loadNavigation() == nil)
    }

    @Test(
        "a fresh remote download repairs a damaged owned blob and remains valid after cold offline reopen",
        arguments: [false, true])
    internal func repairOriginal(delete: Bool) async throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let remote = OfflineDiskReader(fixture: fixture)
        let reader = coordinator(fixture, remote: remote)
        let initial = try await reader.file(id: 12)
        try FileManager.default.removeItem(at: initial.temporaryURL)
        let generation = try #require(try fixture.store().originalGeneration(id: 12))
        let blob = try #require(
            FileManager.default.contentsOfDirectory(
                at: fixture.namespace().appendingPathComponent("originals"),
                includingPropertiesForKeys: nil
            ).first)
        if delete {
            try FileManager.default.removeItem(at: blob)
        } else {
            try Data("damaged bytes".utf8).write(to: blob)
        }
        #expect(throws: (any Error).self) { try fixture.store().original(id: 12) }
        #expect(try fixture.store().originalGeneration(id: 12) == generation)
        remote.bytes = "fresh server bytes"
        let repaired = try await reader.file(id: 12)
        #expect(try Data(contentsOf: repaired.temporaryURL) == Data(remote.bytes.utf8))
        try FileManager.default.removeItem(at: repaired.temporaryURL)
        #expect(try fixture.store().original(id: 12)?.generation != generation)
        remote.unavailable = true
        let restored = coordinator(fixture, remote: remote)
        let offline = try await restored.file(id: 12)
        defer { try? FileManager.default.removeItem(at: offline.temporaryURL) }
        #expect(try Data(contentsOf: offline.temporaryURL) == Data(remote.bytes.utf8))
        #expect(try restored.retainedOriginal(id: 12)?.byteCount == Data(remote.bytes.utf8).count)
    }

    @Test(
        "malformed persisted tombstones cannot be written or reconstructed",
        arguments: [TripOfflineReadResource.trip(0), .document(-1), .file(0), .trip(7)])
    internal func invalidationValidation(resource: TripOfflineReadResource) throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let previous = fixture.navigation()
        try fixture.store().replaceNavigation(previous, replacing: nil)
        let invalid = TripDocumentOfflineNavigation(
            owner: previous.owner, catalogue: previous.catalogue, trips: previous.trips,
            originals: previous.originals, selectedTripID: previous.selectedTripID,
            invalidatedResources: [resource])
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().replaceNavigation(invalid, replacing: previous.generation)
        }
        #expect(try fixture.store().loadNavigation() == previous)
        let envelope = InvalidOfflineEnvelope(version: 1, navigation: invalid)
        try JSONEncoder().encode(envelope).write(
            to: fixture.namespace().appendingPathComponent("navigation.json"))
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().loadNavigation()
        }
    }

    private func coordinator(_ fixture: TripDocumentOfflineFixture, remote: OfflineDiskReader)
        -> TripOfflineReadCoordinator
    {
        let owner = fixture.current
        return TripOfflineReadCoordinator(
            trips: remote, documents: remote, store: fixture.store(),
            context: TripOfflineReadContext { fixture.current == owner },
            now: { fixture.verifiedAt })
    }
}

private struct InvalidOfflineEnvelope: Encodable {
    let version: Int
    let navigation: TripDocumentOfflineNavigation
}

@MainActor
private final class OfflineDiskReader: TripsReading, DocumentsReading {
    let fixture: TripDocumentOfflineFixture
    var unavailable = false
    var missing = false
    var bytes = "original bytes"
    private(set) var calls = 0

    init(fixture: TripDocumentOfflineFixture) { self.fixture = fixture }
    func trips() async throws -> [TripRecord] {
        try check()
        return fixture.navigation().catalogue?.trips ?? []
    }
    func trip(id: Int) async throws -> TripSnapshot? {
        try check()
        return missing ? nil : fixture.navigation().trips.first?.snapshot
    }
    func document(id: Int) async throws -> DocumentOriginal? {
        try check()
        return missing ? nil : fixture.navigation().originals.first?.original
    }
    func file(id: Int) async throws -> DownloadedDocument {
        try check()
        if missing { throw DocumentAccessError.notFound }
        return try fixture.download(bytes)
    }
    private func check() throws {
        calls += 1
        if unavailable { throw RepositoryError.unavailable }
    }
}
