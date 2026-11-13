import AppCore
import CryptoKit
import Foundation

@MainActor
internal final class ProtectedTripCaptureDraftStore: TripCaptureDraftStore {
    internal let owner: TripCaptureDraftOwner
    private let root: @MainActor () throws -> URL
    private let isCurrent: @MainActor () throws -> Bool

    internal init(
        owner: TripCaptureDraftOwner, root: @escaping @MainActor () throws -> URL,
        isCurrent: @escaping @MainActor () throws -> Bool
    ) {
        self.owner = owner
        self.root = root
        self.isCurrent = isCurrent
    }

    internal func load(tripID: Int) throws -> TripCaptureDraftState? {
        try assertCurrent()
        guard tripID > 0 else { throw TripCaptureStorageError.invalidRecord }
        let data: Data
        do {
            data = try Data(contentsOf: file(tripID: tripID))
        } catch CocoaError.fileReadNoSuchFile {
            return nil
        }
        let envelope: Envelope
        do { envelope = try JSONDecoder().decode(Envelope.self, from: data) } catch {
            throw TripCaptureStorageError.invalidRecord
        }
        guard envelope.version == 1 else { throw TripCaptureStorageError.invalidRecord }
        try validate(envelope.state, tripID: tripID)
        return envelope.state
    }

    internal func replace(_ state: TripCaptureDraftState, replacing generation: UUID?) throws {
        try assertCurrent()
        try validate(state, tripID: state.tripID)
        guard try load(tripID: state.tripID)?.generation == generation else {
            throw TripCaptureStorageError.generationChanged
        }
        let destination = try file(tripID: state.tripID)
        let directory = destination.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path)
        let data = try JSONEncoder().encode(Envelope(version: 1, state: state))
        try data.write(
            to: destination,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    internal func purgeConfirmedOwner() throws {
        do { try FileManager.default.removeItem(at: directory()) } catch CocoaError.fileNoSuchFile {
            return
        }
    }

    private func assertCurrent() throws {
        guard try isCurrent() else { throw TripCaptureStorageError.ownerChanged }
    }

    private func file(tripID: Int) throws -> URL {
        try directory().appendingPathComponent("\(tripID).json", isDirectory: false)
    }

    private func directory() throws -> URL {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let digest = SHA256.hash(data: try encoder.encode(owner))
        let name = digest.map { String(format: "%02x", $0) }.joined()
        return try root().appendingPathComponent(name, isDirectory: true)
    }

    private func validate(_ state: TripCaptureDraftState, tripID: Int) throws {
        guard state.owner == owner, state.tripID == tripID, tripID > 0,
            (state.pending == nil) == (state.pendingInputGeneration == nil)
        else {
            throw TripCaptureStorageError.invalidRecord
        }
        let receipts = state.receipts + (state.result.map { [$0] } ?? [])
        guard
            receipts.allSatisfy({ result in
                (result.receipt.captures + result.current.captures).allSatisfy {
                    $0.tripId == tripID
                }
            }), Set(state.receipts.map { $0.receipt.operationId }).count == state.receipts.count
        else {
            throw TripCaptureStorageError.invalidRecord
        }
    }

    private struct Envelope: Codable {
        // Versioned local storage, independent of the producer's wire schema.
        let version: Int
        let state: TripCaptureDraftState
    }
}
