/// Authenticated canonical capture access. Unavailable reads throw rather than becoming empty workspaces.
public protocol TripCapturesReading: Sendable {
    /// Reads trip-owned captures, including removed identities required by retry and Undo.
    func captures(tripID: Int) async throws -> TripCaptureWorkspace
}

/// Device-authorized canonical writes. Implementations never manufacture a replacement operation UUID.
public protocol TripCapturesWriting: Sendable {
    /// Submits exactly the retained command; an uncertain outcome requires an explicit retry of the same value.
    func createCapture(tripID: Int, operation: TripCaptureCreateOperation) async throws
        -> TripCaptureOperationResult
}
