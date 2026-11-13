import Foundation

/// An exact create operation retained across an uncertain outcome. Explicit retries reuse this value unchanged.
public struct TripCaptureCreateOperation: Codable, Hashable, Sendable {
    public let operationId: UUID
    public let command: Command

    /// Allocates an operation only when a draft is submitted, never when a failed request is retried.
    public init(operationID: UUID, input: TripCaptureInput) {
        operationId = operationID
        command = Command(input: input)
    }

    /// Producer command, with classification independent of organisation or route placement.
    public struct Command: Codable, Hashable, Sendable {
        public let kind: Kind
        public let input: TripCaptureInput
        internal init(input: TripCaptureInput) {
            kind = .create
            self.input = input
        }
    }
    /// The published canonical producer action.
    public enum Kind: String, Codable, Hashable, Sendable { case create = "capture.create" }
}

/// The Capture projection of an atomic source workspace. Other source kinds retain their own readers.
public struct TripCaptureWorkspace: Codable, Hashable, Sendable {
    public let captures: [TripCaptureRecord]
    /// Retains removed identities rather than making them appear never to have existed.
    public init(captures: [TripCaptureRecord]) { self.captures = captures }
}

/// Immutable operation outcome; replay does not replace this with current source state.
public struct TripCaptureReceipt: Codable, Hashable, Sendable {
    public let operationId: UUID
    public let undoneOperationId: UUID?
    public let captures: [TripCaptureRecord]
    /// Creates the receipt from the producer's original affected records.
    public init(operationID: UUID, undoneOperationID: UUID?, captures: [TripCaptureRecord]) {
        operationId = operationID
        undoneOperationId = undoneOperationID
        self.captures = captures
    }
}

/// Original receipt and current affected captures are distinct, including after replay or Undo.
public struct TripCaptureOperationResult: Codable, Hashable, Sendable {
    public let receipt: TripCaptureReceipt
    public let current: TripCaptureWorkspace
    public let undone: Bool
    public let replayed: Bool
    /// Creates a result without inferring save success from a title, source count or upload metadata.
    public init(
        receipt: TripCaptureReceipt, current: TripCaptureWorkspace, undone: Bool, replayed: Bool
    ) {
        self.receipt = receipt
        self.current = current
        self.undone = undone
        self.replayed = replayed
    }
}
