import AppCore
import Foundation
import Testing

@MainActor
internal final class CaptureTestStore: TripCaptureDraftStore {
    internal let owner = TripCaptureDraftOwner(
        device: PairedDevice(id: "device", baseURL: URL(fileURLWithPath: "/owner")))
    internal var fails = false
    private var records: [Int: Data] = [:]

    internal func load(tripID: Int) throws -> TripCaptureDraftState? {
        guard !fails else { throw TripCaptureStorageError.unavailable }
        return try records[tripID].map {
            try JSONDecoder().decode(TripCaptureDraftState.self, from: $0)
        }
    }

    internal func replace(_ state: TripCaptureDraftState, replacing generation: UUID?) throws {
        guard !fails else { throw TripCaptureStorageError.unavailable }
        guard state.owner == owner else { throw TripCaptureStorageError.ownerChanged }
        guard try load(tripID: state.tripID)?.generation == generation else {
            throw TripCaptureStorageError.generationChanged
        }
        records[state.tripID] = try JSONEncoder().encode(state)
    }
}

@MainActor
internal final class StoredCaptureWriter: TripCapturesWriting {
    internal var operations: [TripCaptureCreateOperation] = []
    internal var succeeds = false
    internal var paused = false
    internal let arrivals: AsyncStream<TripCaptureCreateOperation>
    private let arrival: AsyncStream<TripCaptureCreateOperation>.Continuation
    private var completion: CheckedContinuation<TripCaptureOperationResult, any Error>?
    private let storage: CaptureTestStore

    internal init(storage: CaptureTestStore) {
        self.storage = storage
        (arrivals, arrival) = AsyncStream.makeStream()
    }

    internal func createCapture(tripID: Int, operation: TripCaptureCreateOperation) async throws
        -> TripCaptureOperationResult
    {
        #expect(try storage.load(tripID: tripID)?.pending == operation)
        operations.append(operation)
        if paused {
            return try await withCheckedThrowingContinuation { continuation in
                completion = continuation
                arrival.yield(operation)
            }
        }
        guard succeeds else { throw RepositoryError.unavailable }
        return result(operation)
    }

    internal func finish(_ operation: TripCaptureCreateOperation) {
        completion?.resume(returning: result(operation))
        completion = nil
    }

    private func result(_ operation: TripCaptureCreateOperation) -> TripCaptureOperationResult {
        TripCaptureOperationResult(
            receipt: TripCaptureReceipt(
                operationID: operation.operationId, undoneOperationID: nil, captures: []),
            current: TripCaptureWorkspace(captures: []), undone: false, replayed: false)
    }
}
