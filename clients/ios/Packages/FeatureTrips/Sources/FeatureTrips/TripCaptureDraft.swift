import AppCore
import Foundation
import Observation

@MainActor
@Observable
internal final class TripCaptureDraft: Identifiable {
    nonisolated internal var id: Int { tripID }
    nonisolated internal let tripID: Int
    internal var input = TripCaptureInput() {
        didSet {
            if !restoring {
                inputGeneration = UUID()
                _ = persist()
            }
        }
    }
    internal private(set) var pending: TripCaptureCreateOperation?
    internal private(set) var result: TripCaptureOperationResult?
    internal private(set) var receipts: [UUID: TripCaptureOperationResult] = [:]
    internal private(set) var failure: RepositoryError?
    internal private(set) var saving = false
    @ObservationIgnored internal private(set) var writeTask: Task<Void, Never>?
    internal private(set) var storageFailure: TripCaptureStorageError?
    private let storage: (any TripCaptureDraftStore)?
    private var generation: UUID?
    private var inputGeneration = UUID()
    private var pendingInputGeneration: UUID?
    private var loaded = false
    private var restoring = false
    private let writer: any TripCapturesWriting
    private let didAccept: (Int) -> Void

    internal init(
        tripID: Int, writer: any TripCapturesWriting, storage: (any TripCaptureDraftStore)? = nil,
        didAccept: @escaping (Int) -> Void = { _ in }
    ) {
        self.tripID = tripID
        self.writer = writer
        self.storage = storage
        self.didAccept = didAccept
        restore()
    }

    internal var canEdit: Bool { loaded }

    internal var canSubmit: Bool {
        storageFailure == nil && input.hasSourceMaterial
            && (input.title.map { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                ?? true)
    }
    internal func save() { writeTask = Task { await submit() } }
    internal func retryRetainedRequest() { writeTask = Task { await retry() } }

    internal func submit() async {
        guard pending == nil, !saving, canSubmit else { return }
        result = nil
        pending = TripCaptureCreateOperation(operationID: UUID(), input: input)
        pendingInputGeneration = inputGeneration
        guard persist() else { return }
        await retry()
    }

    internal func retry() async {
        guard let operation = pending, !saving, persist() else { return }
        let submittedInputGeneration = pendingInputGeneration
        saving = true
        failure = nil
        do {
            let value = try await writer.createCapture(tripID: tripID, operation: operation)
            guard value.receipt.operationId == operation.operationId,
                value.receipt.captures.allSatisfy({ $0.tripId == tripID }),
                value.current.captures.allSatisfy({ $0.tripId == tripID })
            else { throw RepositoryError.contractMismatch }
            receipts[operation.operationId] = value
            result = value
            pending = nil
            pendingInputGeneration = nil
            if let submittedInputGeneration, inputGeneration == submittedInputGeneration {
                restoring = true
                input = TripCaptureInput()
                inputGeneration = UUID()
                restoring = false
            }
            _ = persist()
            didAccept(tripID)
        } catch {
            failure = error as? RepositoryError ?? .unavailable
        }
        saving = false
    }

    internal func retryStorage() {
        guard !saving else { return }
        if loaded { _ = persist() } else { restore() }
    }

    private func restore() {
        guard let storage else {
            loaded = true
            return
        }
        do {
            let state = try storage.load(tripID: tripID)
            restoring = true
            defer { restoring = false }
            if let state {
                guard state.owner == storage.owner, state.tripID == tripID,
                    (state.pending == nil) == (state.pendingInputGeneration == nil)
                else {
                    throw TripCaptureStorageError.invalidRecord
                }
                input = state.input
                inputGeneration = state.inputGeneration
                pendingInputGeneration = state.pendingInputGeneration
                pending = state.pending
                result = state.result
                for receipt in state.receipts { receipts[receipt.receipt.operationId] = receipt }
                generation = state.generation
            }
            loaded = true
            storageFailure = nil
        } catch {
            storageFailure = error as? TripCaptureStorageError ?? .unavailable
        }
    }

    private func persist() -> Bool {
        guard let storage else { return true }
        guard loaded else { return false }
        let state = TripCaptureDraftState(
            owner: storage.owner, tripID: tripID, input: input, pending: pending,
            inputGeneration: inputGeneration, pendingInputGeneration: pendingInputGeneration,
            result: result, receipts: Array(receipts.values))
        do {
            try storage.replace(state, replacing: generation)
            generation = state.generation
            storageFailure = nil
            return true
        } catch {
            storageFailure = error as? TripCaptureStorageError ?? .unavailable
            return false
        }
    }
}

@MainActor
internal final class TripCaptureDrafts {
    private let writer: any TripCapturesWriting
    private let storage: (any TripCaptureDraftStore)?
    private let didAccept: (Int) -> Void
    private var drafts: [Int: TripCaptureDraft] = [:]
    internal init(
        writer: any TripCapturesWriting, storage: (any TripCaptureDraftStore)? = nil,
        didAccept: @escaping (Int) -> Void = { _ in }
    ) {
        self.writer = writer
        self.storage = storage
        self.didAccept = didAccept
    }
    internal func draft(tripID: Int) -> TripCaptureDraft {
        if let draft = drafts[tripID] { return draft }
        let draft = TripCaptureDraft(
            tripID: tripID, writer: writer, storage: storage, didAccept: didAccept)
        drafts[tripID] = draft
        return draft
    }
}
