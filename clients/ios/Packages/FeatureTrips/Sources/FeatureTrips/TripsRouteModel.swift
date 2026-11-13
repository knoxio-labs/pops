import AppCore
import Foundation
import Observation

internal enum TripsRouteReadState: Equatable {
    case idle
    case unbound
    case loading
    case loaded(TripRouteSnapshot)
    case missing
    case failed(RepositoryError)
}

@MainActor
@Observable
internal final class TripsRouteModel {
    internal private(set) var state: TripsRouteReadState
    internal private(set) var selectedID: Int?
    @ObservationIgnored internal private(set) var readTask: Task<Void, Never>?
    private let reader: (any TripsRouteReading)?
    private var request = UUID()

    internal var isBound: Bool { reader != nil }

    internal init(reader: (any TripsRouteReading)?) {
        self.reader = reader
        state = reader == nil ? .unbound : .idle
    }

    internal func select(_ id: Int) {
        readTask?.cancel()
        let token = UUID()
        request = token
        selectedID = id
        guard let reader else {
            state = .unbound
            return
        }
        state = .loading
        readTask = Task {
            do {
                let result = try await reader.route(tripId: id)
                guard request == token else { return }
                guard result == nil || result?.tripId == id else {
                    throw RepositoryError.contractMismatch
                }
                state = result.map(TripsRouteReadState.loaded) ?? .missing
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
