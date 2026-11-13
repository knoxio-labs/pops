import AppCore
import Foundation
import Testing

@testable import Pops

@Suite("Durable Trip document originals")
@MainActor
internal struct TripDocumentOfflineStoreTests {
    @Test(
        "fresh instances recover navigation and exact original bytes without a network dependency")
    internal func coldReconstruction() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let navigation = fixture.navigation()
        try fixture.store().replaceNavigation(navigation, replacing: nil)
        let original = try fixture.download("%PDF-1.7\noriginal ticket bytes")
        let record = try fixture.store().retainOriginal(
            original, id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        try FileManager.default.removeItem(at: original.temporaryURL)
        let restored = try #require(try fixture.store().loadNavigation())
        #expect(restored == navigation)
        #expect(restored.selectedTripID == 7)
        #expect(restored.trips.first?.snapshot.documentAssociations.first?.documentId == 12)
        #expect(restored.trips.first?.snapshot.documentAssociations.first?.id == 91)
        #expect(try fixture.store().original(id: 12) == record)
        let preview = try #require(try fixture.store().previewOriginal(id: 12))
        defer { try? FileManager.default.removeItem(at: preview.temporaryURL) }
        #expect(
            try Data(contentsOf: preview.temporaryURL)
                == Data("%PDF-1.7\noriginal ticket bytes".utf8))
        #expect(record.verifiedAt == fixture.verifiedAt)
        #expect(preview.metadata == original.metadata)
    }

    @Test(
        "navigation, original bytes and manifests request atomic writes with the exact protection class"
    )
    internal func requestedWritePolicy() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let owner = fixture.current
        var writes: [(URL, Data.WritingOptions)] = []
        let store = ProtectedTripDocumentStore(
            owner: owner, root: { fixture.root }, isCurrent: { fixture.current == owner },
            writeData: { data, url, options in
                writes.append((url, options))
                try data.write(to: url, options: options)
            })
        let navigation = fixture.navigation()
        try store.replaceNavigation(navigation, replacing: nil)
        let retained = try store.retainOriginal(
            fixture.download("original"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        #expect(try store.loadNavigation() == navigation)
        #expect(try store.original(id: 12) == retained)
        #expect(writes.count == 3)
        for (_, options) in writes {
            #expect(options.contains(.atomic))
            #expect(
                options.rawValue & Data.WritingOptions.fileProtectionMask.rawValue
                    == Data.WritingOptions.completeFileProtectionUntilFirstUserAuthentication
                    .rawValue)
        }
    }

    @Test("metadata and associations never manufacture local file availability")
    internal func unopenedOriginal() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        try fixture.store().replaceNavigation(fixture.navigation(), replacing: nil)
        #expect(try fixture.store().original(id: 12) == nil)
        #expect(try fixture.store().previewOriginal(id: 12) == nil)
        #expect(try fixture.store().original(id: 91) == nil)
        #expect(try fixture.store().loadNavigation()?.originals.first?.original.id == 12)
    }

    @Test(
        "preview release deletes only the disposable copy and the retained original stays protected"
    )
    internal func previewOwnership() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let record = try fixture.store().retainOriginal(
            fixture.download("original"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let preview = try #require(try fixture.store().previewOriginal(id: 12))
        var file: DocumentPreviewFile? = try DocumentPreviewFile(download: preview, id: 12)
        let url = try #require(file?.url)
        #expect(FileManager.default.fileExists(atPath: url.path))
        file = nil
        #expect(!FileManager.default.fileExists(atPath: url.path))
        #expect(try fixture.store().original(id: 12) == record)
        let namespace = try fixture.namespace()
        let blob = try #require(
            FileManager.default.contentsOfDirectory(
                at: namespace.appendingPathComponent("originals"), includingPropertiesForKeys: nil
            ).first)
        var persistedBlob = blob
        persistedBlob.removeAllCachedResourceValues()
        let protection = try #require(
            try persistedBlob.resourceValues(forKeys: [.fileProtectionKey]).fileProtection)
        #expect(protection == .completeUntilFirstUserAuthentication)
    }

    @Test(
        "same-size tampering and truncation fail integrity rather than opening a successful cache hit",
        arguments: ["tampered!", "short"])
    internal func integrity(text: String) throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        _ = try fixture.store().retainOriginal(
            fixture.download("original"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let blob = try #require(
            FileManager.default.contentsOfDirectory(
                at: fixture.namespace().appendingPathComponent("originals"),
                includingPropertiesForKeys: nil
            ).first)
        try Data(text.utf8).write(to: blob)
        #expect(throws: TripDocumentOfflineError.corruptOriginal) {
            try fixture.store().original(id: 12)
        }
        #expect(throws: TripDocumentOfflineError.corruptOriginal) {
            try fixture.store().previewOriginal(id: 12)
        }
        #expect(try fixture.store().previewOriginal(id: 13) == nil)
    }

    @Test("an incomplete transfer or stale writer cannot replace an earlier verified original")
    internal func failedReplacement() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let previous = try fixture.store().retainOriginal(
            fixture.download("old bytes"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        #expect(throws: TripDocumentOfflineError.corruptOriginal) {
            try fixture.store().retainOriginal(
                fixture.download("partial", responseSize: 99), id: 12,
                verifiedAt: fixture.verifiedAt, replacing: previous.generation)
        }
        #expect(throws: TripDocumentOfflineError.generationChanged) {
            try fixture.store().retainOriginal(
                fixture.download("new bytes"), id: 12, verifiedAt: fixture.verifiedAt,
                replacing: nil)
        }
        #expect(try fixture.store().original(id: 12) == previous)
        let preview = try #require(try fixture.store().previewOriginal(id: 12))
        defer { try? FileManager.default.removeItem(at: preview.temporaryURL) }
        #expect(try Data(contentsOf: preview.temporaryURL) == Data("old bytes".utf8))
    }
    @Test(
        "denied blob or manifest writes never publish a replacement over the last-good original",
        arguments: ["originals", "documents"])
    internal func deniedWrite(directory: String) throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let previous = try fixture.store().retainOriginal(
            fixture.download("old bytes"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let namespace = try fixture.namespace()
        let manifest = namespace.appendingPathComponent("documents/12.json")
        let previousManifest = try Data(contentsOf: manifest)
        let blocked = namespace.appendingPathComponent(directory)
        let attributes = try FileManager.default.attributesOfItem(atPath: blocked.path)
        let permissions = try #require(attributes[.posixPermissions])
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o500], ofItemAtPath: blocked.path)
        defer {
            try? FileManager.default.setAttributes(
                [.posixPermissions: permissions], ofItemAtPath: blocked.path)
        }
        let replacement = try fixture.download("replacement bytes")
        #expect(throws: (any Error).self) {
            try fixture.store().retainOriginal(
                replacement, id: 12, verifiedAt: fixture.verifiedAt, replacing: previous.generation)
        }
        #expect(try Data(contentsOf: manifest) == previousManifest)
        #expect(try fixture.store().original(id: 12) == previous)
        let blobs = try FileManager.default.contentsOfDirectory(
            at: namespace.appendingPathComponent("originals"), includingPropertiesForKeys: nil)
        #expect(blobs.count == (directory == "documents" ? 2 : 1))
    }
}
