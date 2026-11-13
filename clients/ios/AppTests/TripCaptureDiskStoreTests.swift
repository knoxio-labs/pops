import AppCore
import Foundation
import Testing

@testable import Pops

@Suite("Protected capture drafts on disk")
@MainActor
internal struct TripCaptureDiskStoreTests {
    @Test("fresh store instances recover verbatim fields, exact pending UUID and original receipts")
    internal func restart() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let owner = try owner()
        let input = TripCaptureInput(
            originalText: "  original\n", originalUrl: "https://source.example")
        let operation = TripCaptureCreateOperation(operationID: UUID(), input: input)
        let inputGeneration = UUID()
        let state = TripCaptureDraftState(
            owner: owner, tripID: 7, input: input, pending: operation,
            inputGeneration: inputGeneration, pendingInputGeneration: inputGeneration,
            result: nil, receipts: [])
        try store(owner, root).replace(state, replacing: nil)
        #expect(try store(owner, root).load(tripID: 7) == state)
        let receipt = TripCaptureOperationResult(
            receipt: TripCaptureReceipt(
                operationID: operation.operationId, undoneOperationID: nil, captures: []),
            current: TripCaptureWorkspace(captures: []), undone: false, replayed: true)
        let completed = TripCaptureDraftState(
            owner: owner, tripID: 7, input: TripCaptureInput(originalText: "New draft"),
            pending: nil, result: receipt, receipts: [receipt])
        try store(owner, root).replace(completed, replacing: state.generation)
        #expect(try store(owner, root).load(tripID: 7) == completed)
    }

    @Test(
        "origin, device, pairing revision and Trip each isolate records without pruning old owners")
    internal func namespaces() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let owners = [
            try owner(), try owner(origin: "https://other.example"),
            try owner(device: "another"), try owner(revision: 2),
        ]
        for (index, owner) in owners.enumerated() {
            let state = TripCaptureDraftState(
                owner: owner, tripID: 7, input: TripCaptureInput(originalText: "Owner \(index)"),
                pending: nil, result: nil, receipts: [])
            try store(owner, root).replace(state, replacing: nil)
        }
        for (index, owner) in owners.enumerated() {
            #expect(try store(owner, root).load(tripID: 7)?.input.originalText == "Owner \(index)")
            #expect(try store(owner, root).load(tripID: 8) == nil)
        }
    }

    @Test("stale generations and foreign payloads cannot replace the current owner record")
    internal func generationAndOwner() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let owner = try owner()
        let storage = store(owner, root)
        let state = TripCaptureDraftState(
            owner: owner, tripID: 7, input: TripCaptureInput(originalText: "Keep"),
            pending: nil, result: nil, receipts: [])
        try storage.replace(state, replacing: nil)
        #expect(throws: TripCaptureStorageError.generationChanged) {
            try storage.replace(state, replacing: UUID())
        }
        let foreign = TripCaptureDraftState(
            owner: try self.owner(origin: "https://other.example"), tripID: 7,
            input: TripCaptureInput(originalText: "Foreign"), pending: nil, result: nil,
            receipts: [])
        #expect(throws: TripCaptureStorageError.invalidRecord) {
            try storage.replace(foreign, replacing: state.generation)
        }
        #expect(try storage.load(tripID: 7) == state)
        let directory = try #require(
            FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).first
        )
        try Data("truncated".utf8).write(to: directory.appendingPathComponent("7.json"))
        #expect(throws: TripCaptureStorageError.invalidRecord) { try storage.load(tripID: 7) }
    }

    @Test("an unavailable filesystem is not an empty writable draft")
    internal func unavailable() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let blocked = root.appendingPathComponent("regular-file")
        let original = Data("keep".utf8)
        try original.write(to: blocked)
        let owner = try owner()
        let state = TripCaptureDraftState(
            owner: owner, tripID: 7, input: TripCaptureInput(originalText: "Unsent"),
            pending: nil, result: nil, receipts: [])
        #expect(throws: (any Error).self) {
            try store(owner, blocked).replace(state, replacing: nil)
        }
        #expect(try Data(contentsOf: blocked) == original)
    }

    @Test("firstNamespace valid foreign record copied beneath A's filename is never adopted by A")
    internal func foreignFile() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try owner()
        let second = try owner(origin: "https://other.example")
        func state(_ owner: TripCaptureDraftOwner) -> TripCaptureDraftState {
            TripCaptureDraftState(
                owner: owner, tripID: 7, input: TripCaptureInput(originalText: "Original"),
                pending: nil, result: nil, receipts: [])
        }
        try store(first, root).replace(state(first), replacing: nil)
        let firstNamespace = try #require(
            FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).first
        )
        try store(second, root).replace(state(second), replacing: nil)
        let secondNamespace = try #require(
            FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).first
            { $0 != firstNamespace })
        try Data(contentsOf: secondNamespace.appendingPathComponent("7.json")).write(
            to: firstNamespace.appendingPathComponent("7.json"))
        #expect(throws: TripCaptureStorageError.invalidRecord) {
            try store(first, root).load(tripID: 7)
        }
        #expect(try store(second, root).load(tripID: 7)?.owner == second)
    }

    private func owner(
        origin: String = "https://owner.example", device: String = "device", revision: UInt64 = 1
    ) throws -> TripCaptureDraftOwner {
        TripCaptureDraftOwner(
            device: PairedDevice(
                id: device, baseURL: try #require(URL(string: origin)), credentialRevision: revision
            ))
    }

    private func store(_ owner: TripCaptureDraftOwner, _ root: URL)
        -> ProtectedTripCaptureDraftStore
    {
        ProtectedTripCaptureDraftStore(owner: owner, root: { root }, isCurrent: { true })
    }

    private func temporaryRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
}
