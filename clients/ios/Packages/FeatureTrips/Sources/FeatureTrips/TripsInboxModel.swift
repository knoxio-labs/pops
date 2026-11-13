import AppCore
import Foundation
import Observation

internal enum TripsInboxReadState: Equatable {
    case idle
    case unbound
    case loading
    case loaded(TripCaptureWorkspace)
    case failed(RepositoryError)
}

@MainActor
@Observable
internal final class TripsInboxModel {
    internal private(set) var state: TripsInboxReadState
    internal private(set) var selectedID: Int?
    @ObservationIgnored internal private(set) var readTask: Task<Void, Never>?
    private let reader: (any TripCapturesReading)?
    private var request = UUID()

    internal var isBound: Bool { reader != nil }

    internal init(reader: (any TripCapturesReading)?) {
        self.reader = reader
        state = reader == nil ? .unbound : .idle
    }

    internal func select(_ tripID: Int) {
        readTask?.cancel()
        let token = UUID()
        request = token
        selectedID = tripID
        guard let reader else {
            state = .unbound
            return
        }
        state = .loading
        readTask = Task {
            do {
                let workspace = try await reader.captures(tripID: tripID)
                guard request == token else { return }
                guard workspace.captures.allSatisfy({ $0.tripId == tripID }),
                    Set(workspace.captures.map(\.id)).count == workspace.captures.count
                else { throw RepositoryError.contractMismatch }
                state = .loaded(workspace)
            } catch {
                guard request == token else { return }
                state = .failed(error as? RepositoryError ?? .unavailable)
            }
        }
    }

    internal func clear() {
        readTask?.cancel()
        readTask = nil
        request = UUID()
        selectedID = nil
        state = reader == nil ? .unbound : .idle
    }

    internal func retry() {
        if let selectedID { select(selectedID) }
    }
}

internal struct TripsInboxProjection {
    internal let active: [TripCaptureRecord]
    internal let removed: [TripCaptureRecord]

    internal init(workspace: TripCaptureWorkspace) {
        active = workspace.captures.filter { $0.removedAt == nil }
        removed = workspace.captures.filter { $0.removedAt != nil }
    }
}
