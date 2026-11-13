import Foundation

/// A pairing namespace. Normal token rotation retains this revision; another origin or pairing cannot adopt its drafts.
public struct TripCaptureDraftOwner: Codable, Hashable, Sendable {
    public let baseURL: URL
    public let deviceID: String
    public let credentialRevision: UInt64

    /// Captures the paired identity without copying tokens or signing material.
    public init(device: PairedDevice) {
        baseURL = device.baseURL
        deviceID = device.id
        credentialRevision = device.credentialRevision
    }
}

/// One durable draft generation, including the exact command whose delivery may be uncertain.
/// Receipt storage and pending-command removal are one replacement; newer field edits remain independent of the
/// command input.
public struct TripCaptureDraftState: Codable, Hashable, Sendable {
    public let owner: TripCaptureDraftOwner
    public let tripID: Int
    public let generation: UUID
    /// Changes only when the composer input changes, independently of storage replacements or command retries.
    public let inputGeneration: UUID
    /// The input generation submitted with pending; equality of captured text is not an edit identity.
    public let pendingInputGeneration: UUID?
    public let input: TripCaptureInput
    public let pending: TripCaptureCreateOperation?
    public let result: TripCaptureOperationResult?
    public let receipts: [TripCaptureOperationResult]

    /// Creates a complete replacement, never a partial update or an instruction to dispatch a request.
    /// A pending command requires its submitted input generation; stores reject incomplete identity pairs.
    public init(
        owner: TripCaptureDraftOwner, tripID: Int, generation: UUID = UUID(),
        input: TripCaptureInput, pending: TripCaptureCreateOperation?,
        inputGeneration: UUID = UUID(), pendingInputGeneration: UUID? = nil,
        result: TripCaptureOperationResult?, receipts: [TripCaptureOperationResult]
    ) {
        self.owner = owner
        self.tripID = tripID
        self.generation = generation
        self.input = input
        self.inputGeneration = inputGeneration
        self.pendingInputGeneration = pendingInputGeneration
        self.pending = pending
        self.result = result
        self.receipts = receipts
    }
}

/// Storage failures block dispatch. Missing files alone mean an empty draft; unreadable or foreign records never do.
public enum TripCaptureStorageError: Error, Hashable, Sendable {
    case unavailable
    case ownerChanged
    case generationChanged
    case invalidRecord
}

/// Owner-bound durable storage supplied by the app. Calls complete synchronously before a network write may begin.
@MainActor
public protocol TripCaptureDraftStore {
    /// Immutable namespace used by every operation on this store instance.
    var owner: TripCaptureDraftOwner { get }
    /// Returns nil only when this owner's Trip has no stored record; never starts or retries a network operation.
    func load(tripID: Int) throws -> TripCaptureDraftState?
    /// Atomically replaces exactly the expected generation. Nil requires an absent record.
    /// Implementations must reject a stale pairing at point of use and preserve the previous file on failure.
    func replace(_ state: TripCaptureDraftState, replacing generation: UUID?) throws
}
