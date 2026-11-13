import AppCore
import Foundation
import Testing

@testable import Pops

@Suite("Protected original replacement CAS")
@MainActor
internal struct TripOfflineOriginalReplacementTests {
    @Test("a competing publication during the real blob write preserves the newer generation")
    internal func stalePublication() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let initial = try fixture.store().retainOriginal(
            fixture.download("initial"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        var winner: TripOfflineFileRecord?
        let store = ProtectedTripDocumentStore(
            owner: fixture.current, root: { fixture.root }, isCurrent: { true },
            writeData: { data, url, options in
                try data.write(to: url, options: options)
                if url.deletingLastPathComponent().lastPathComponent == "originals", winner == nil {
                    winner = try fixture.store().retainOriginal(
                        fixture.download("winner"), id: 12, verifiedAt: fixture.verifiedAt,
                        replacing: initial.generation)
                }
            })
        #expect(throws: TripDocumentOfflineError.generationChanged) {
            try store.retainOriginal(
                fixture.download("stale"), id: 12, verifiedAt: fixture.verifiedAt,
                replacing: initial.generation)
        }
        let accepted = try #require(winner)
        #expect(try fixture.store().original(id: 12) == accepted)
        let preview = try #require(try fixture.store().previewOriginal(id: 12))
        defer { try? FileManager.default.removeItem(at: preview.temporaryURL) }
        #expect(try Data(contentsOf: preview.temporaryURL) == Data("winner".utf8))
    }

    @Test("a foreign owner index cannot provide a CAS token or be repaired by a fresh download")
    internal func foreignIndex() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let owner = fixture.current
        let initial = try fixture.store().retainOriginal(
            fixture.download("A"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let firstIndex = try fixture.namespace().appendingPathComponent("documents/12.json")
        fixture.current = try TripDocumentOfflineFixture.owner(origin: "https://other.example")
        _ = try fixture.store().retainOriginal(
            fixture.download("B"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let foreign = try Data(
            contentsOf: fixture.namespace().appendingPathComponent("documents/12.json"))
        try foreign.write(to: firstIndex)
        fixture.current = owner
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().originalGeneration(id: 12)
        }
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().retainOriginal(
                fixture.download("new"), id: 12, verifiedAt: fixture.verifiedAt,
                replacing: initial.generation)
        }
        #expect(try Data(contentsOf: firstIndex) == foreign)
    }

    @Test("malformed index integrity metadata and symlink indexes are not replacement authority")
    internal func malformedIndex() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let record = try fixture.store().retainOriginal(
            fixture.download("old"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let index = try fixture.namespace().appendingPathComponent("documents/12.json")
        let previous = try Data(contentsOf: index)
        let decoded = try JSONDecoder().decode(ReplacementIndex.self, from: previous)
        let invalid = TripOfflineFileRecord(
            owner: record.owner, documentID: record.documentID, generation: record.generation,
            verifiedAt: record.verifiedAt, byteCount: record.byteCount, sha256: "invalid",
            metadata: record.metadata)
        try JSONEncoder().encode(
            ReplacementIndex(version: decoded.version, record: invalid, blobID: decoded.blobID)
        ).write(to: index)
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().originalGeneration(id: 12)
        }
        try FileManager.default.removeItem(at: index)
        let target = fixture.root.appendingPathComponent("index-target")
        try previous.write(to: target)
        try FileManager.default.createSymbolicLink(at: index, withDestinationURL: target)
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().originalGeneration(id: 12)
        }
        #expect(try Data(contentsOf: target) == previous)
    }
}

private struct ReplacementIndex: Codable {
    let version: Int
    let record: TripOfflineFileRecord
    let blobID: UUID
}
