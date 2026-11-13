import AppCore
import Foundation
import Testing

@testable import Pops

@Suite("Offline Trip ownership and atomic navigation")
@MainActor
internal struct TripDocumentOfflineOwnershipTests {
    @Test(
        "origin, device and pairing revision isolate bytes; replacement leaves old namespaces quarantined"
    )
    internal func namespaces() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let owners = [
            fixture.current, try TripDocumentOfflineFixture.owner(origin: "https://other.example"),
            try TripDocumentOfflineFixture.owner(device: "other"),
            try TripDocumentOfflineFixture.owner(revision: 2),
        ]
        for (index, owner) in owners.enumerated() {
            fixture.current = owner
            _ = try fixture.store().retainOriginal(
                fixture.download("Owner \(index)"), id: 12, verifiedAt: fixture.verifiedAt,
                replacing: nil)
        }
        for (index, owner) in owners.enumerated() {
            fixture.current = owner
            let preview = try #require(try fixture.store().previewOriginal(id: 12))
            defer { try? FileManager.default.removeItem(at: preview.temporaryURL) }
            #expect(try Data(contentsOf: preview.temporaryURL) == Data("Owner \(index)".utf8))
        }
        let directories = try FileManager.default.contentsOfDirectory(
            at: fixture.root, includingPropertiesForKeys: [.isDirectoryKey])
        let namespaces = try directories.filter {
            try $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true
        }
        #expect(namespaces.count == 4)
    }

    @Test(
        "ordinary token rotation identity remains valid; firstNamespace changed current owner fails every operation"
    )
    internal func pointUse() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let first = fixture.current
        let storage = fixture.store()
        let navigation = fixture.navigation()
        try storage.replaceNavigation(navigation, replacing: nil)
        _ = try storage.retainOriginal(
            fixture.download("keep"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        fixture.current = try TripDocumentOfflineFixture.owner()
        #expect(try storage.loadNavigation() == navigation)
        fixture.current = try TripDocumentOfflineFixture.owner(revision: 2)
        #expect(throws: TripDocumentOfflineError.ownerChanged) { try storage.loadNavigation() }
        #expect(throws: TripDocumentOfflineError.ownerChanged) { try storage.original(id: 12) }
        #expect(throws: TripDocumentOfflineError.ownerChanged) {
            try storage.previewOriginal(id: 12)
        }
        #expect(throws: TripDocumentOfflineError.ownerChanged) {
            try storage.replaceNavigation(
                fixture.navigation(owner: first), replacing: navigation.generation)
        }
        #expect(throws: TripDocumentOfflineError.ownerChanged) {
            try storage.retainOriginal(
                fixture.download("new"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        }
        #expect(try fixture.store().loadNavigation() == nil)
        #expect(FileManager.default.fileExists(atPath: try fixture.namespace(first).path))
    }

    @Test("foreign manifests cannot be adopted even beneath this owner's exact document filename")
    internal func foreignRecord() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let first = fixture.current
        try fixture.store().replaceNavigation(fixture.navigation(), replacing: nil)
        _ = try fixture.store().retainOriginal(
            fixture.download("A"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let firstNamespace = try fixture.namespace()
        fixture.current = try TripDocumentOfflineFixture.owner(origin: "https://other.example")
        try fixture.store().replaceNavigation(fixture.navigation(), replacing: nil)
        _ = try fixture.store().retainOriginal(
            fixture.download("B"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let secondNamespace = try fixture.namespace()
        for path in ["navigation.json", "documents/12.json"] {
            try Data(contentsOf: secondNamespace.appendingPathComponent(path)).write(
                to: firstNamespace.appendingPathComponent(path))
        }
        fixture.current = first
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().loadNavigation()
        }
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().original(id: 12)
        }
    }

    @Test("stale navigation writers and foreign association records preserve the last-good source")
    internal func navigationValidation() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let original = fixture.navigation()
        try fixture.store().replaceNavigation(original, replacing: nil)
        #expect(throws: TripDocumentOfflineError.generationChanged) {
            try fixture.store().replaceNavigation(fixture.navigation(), replacing: UUID())
        }
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().replaceNavigation(
                fixture.navigation(associationTrip: 8), replacing: original.generation)
        }
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().replaceNavigation(
                fixture.navigation(selectedTrip: 99), replacing: original.generation)
        }
        #expect(try fixture.store().loadNavigation() == original)
        try Data("malformed".utf8).write(
            to: fixture.namespace().appendingPathComponent("navigation.json"))
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().loadNavigation()
        }
    }

    @Test(
        "unreadable storage and missing retained bytes are errors, never firstNamespace successful empty cache"
    )
    internal func readErrors() throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let blocked = fixture.root.appendingPathComponent("blocked")
        try Data("file".utf8).write(to: blocked)
        let storage = ProtectedTripDocumentStore(
            owner: fixture.current, root: { blocked }, isCurrent: { true })
        #expect(throws: TripDocumentOfflineError.invalidRecord) { try storage.loadNavigation() }
        _ = try fixture.store().retainOriginal(
            fixture.download("keep"), id: 12, verifiedAt: fixture.verifiedAt, replacing: nil)
        let blob = try #require(
            FileManager.default.contentsOfDirectory(
                at: fixture.namespace().appendingPathComponent("originals"),
                includingPropertiesForKeys: nil
            ).first)
        try FileManager.default.removeItem(at: blob)
        #expect(throws: (any Error).self) { try fixture.store().original(id: 12) }
        #expect(throws: (any Error).self) { try fixture.store().previewOriginal(id: 12) }
    }
    @Test(
        "every published association kind requires its exact source-owned target",
        arguments: ["trip", "visit", "journey", "stay", "event"])
    internal func associationTargets(kind: String) throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let targetIDs = ["trip": 7, "visit": 21, "journey": 40, "stay": 70, "event": 80]
        let valid = fixture.navigation(targetKind: kind, targetID: try #require(targetIDs[kind]))
        try fixture.store().replaceNavigation(valid, replacing: nil)
        #expect(try fixture.store().loadNavigation() == valid)
        let invalid = fixture.navigation(targetKind: kind, targetID: kind == "trip" ? 99 : 999)
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().replaceNavigation(invalid, replacing: valid.generation)
        }
        #expect(try fixture.store().loadNavigation() == valid)
        let envelope = InvalidNavigationEnvelope(version: 1, navigation: invalid)
        try JSONEncoder().encode(envelope).write(
            to: fixture.namespace().appendingPathComponent("navigation.json"))
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().loadNavigation()
        }
    }

    @Test(
        "firstNamespace matching ID in another kind or an unsupported kind is not firstNamespace target",
        arguments: ["trip", "visit", "journey", "stay", "event", "unknown"])
    internal func wrongKind(kind: String) throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let invalid = fixture.navigation(targetKind: kind, targetID: kind == "visit" ? 40 : 21)
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().replaceNavigation(invalid, replacing: nil)
        }
        #expect(try fixture.store().loadNavigation() == nil)
    }

    @Test(
        "firstNamespace target with the right ID but firstNamespace different source Trip is never adopted",
        arguments: ["visit", "journey", "stay", "event"])
    internal func foreignTargetOwner(kind: String) throws {
        let fixture = try TripDocumentOfflineFixture()
        defer { fixture.remove() }
        let targetIDs = ["visit": 21, "journey": 40, "stay": 70, "event": 80]
        let id = try #require(targetIDs[kind])
        let valid = fixture.navigation(targetKind: kind, targetID: id)
        try fixture.store().replaceNavigation(valid, replacing: nil)
        let invalid = fixture.navigation(targetKind: kind, targetID: id, sourceTripID: 8)
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().replaceNavigation(invalid, replacing: valid.generation)
        }
        #expect(try fixture.store().loadNavigation() == valid)
        try JSONEncoder().encode(InvalidNavigationEnvelope(version: 1, navigation: invalid)).write(
            to: fixture.namespace().appendingPathComponent("navigation.json"))
        #expect(throws: TripDocumentOfflineError.invalidRecord) {
            try fixture.store().loadNavigation()
        }
    }

    private struct InvalidNavigationEnvelope: Encodable {
        let version: Int
        let navigation: TripDocumentOfflineNavigation
    }
}
