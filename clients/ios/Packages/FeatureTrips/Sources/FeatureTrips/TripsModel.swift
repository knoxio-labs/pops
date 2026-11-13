import AppCore
import Foundation
import Observation

@MainActor
@Observable
internal final class TripsModel {
    internal var searchQuery = ""
    private var searchOrigin = TripsTab.trips
    internal private(set) var trips: [TripRecord] = []
    internal private(set) var snapshot: TripSnapshot?
    internal private(set) var selectedID: Int?
    internal private(set) var loading = false
    internal private(set) var failure: RepositoryError?
    internal let route: TripsRouteModel
    internal let inbox: TripsInboxModel
    internal var tab = TripsTab.trips {
        didSet {
            if tab != oldValue {
                if tab == .search { searchOrigin = oldValue }
                navigationIntent = UUID()
                source = nil
            }
        }
    }
    internal var source: TripSource? {
        didSet { sourceEpoch = UUID() }
    }
    internal private(set) var sourceEpoch = UUID()
    internal var capture: TripCaptureDraft?
    @ObservationIgnored internal private(set) var navigationTask: Task<Void, Never>?
    private let repository: any TripsReading
    private let selection: (any TripOfflineSelection)?
    private var request = UUID()
    private var navigationIntent = UUID()

    internal init(
        repository: any TripsReading, selection: (any TripOfflineSelection)? = nil,
        routeReader: (any TripsRouteReading)? = nil,
        captureReader: (any TripCapturesReading)? = nil
    ) {
        self.repository = repository
        self.selection = selection
        route = TripsRouteModel(reader: routeReader)
        inbox = TripsInboxModel(reader: captureReader)
    }

    internal func dismissSearch() {
        guard tab == .search else { return }
        tab = searchOrigin
    }

    internal func openTrip(_ id: Int, sourceID: String? = nil) {
        source = nil
        tab = .trips
        let intent = UUID()
        navigationIntent = intent
        navigationTask = Task {
            guard navigationIntent == intent else { return }
            let accepted = await readSelection(id)
            guard accepted, navigationIntent == intent else { return }
            if let sourceID, selectedID == id, let snapshot,
                snapshot.trip.id == id
            {
                source = allTripSources(snapshot).first { $0.id == sourceID }
            }
        }
    }

    internal func canonicalSource(_ source: TripSource) -> TripSource? {
        guard let snapshot, snapshot.trip.id == source.tripID else { return nil }
        return allTripSources(snapshot).first { $0.id == source.id }
    }

    internal func captureAccepted(tripID: Int) {
        guard selectedID == tripID, inbox.selectedID == tripID else { return }
        inbox.retry()
    }

    internal func load() async {
        navigationIntent = UUID()
        source = nil
        let token = UUID()
        request = token
        loading = true
        failure = nil
        do {
            let records = try await repository.trips()
            guard request == token else { return }
            trips = records
            if selectedID == nil { selectedID = try selection?.selectedTripID() }
            if let id = selectedID, records.contains(where: { $0.id == id }) {
                await select(id)
            } else {
                selectedID = nil
                snapshot = nil
                route.clear()
                inbox.clear()
                loading = false
            }
        } catch {
            guard request == token else { return }
            failure = error as? RepositoryError ?? .unavailable
            loading = false
        }
    }

    internal func select(_ id: Int) async {
        navigationIntent = UUID()
        source = nil
        _ = await readSelection(id)
    }

    private func readSelection(_ id: Int) async -> Bool {
        let token = UUID()
        request = token
        selectedID = id
        route.select(id)
        inbox.select(id)
        snapshot = nil
        failure = nil
        loading = true
        do {
            let result = try await repository.trip(id: id)
            guard request == token else { return false }
            guard result == nil || result?.trip.id == id else {
                throw RepositoryError.contractMismatch
            }
            if result != nil { try selection?.selectTrip(id) }
            snapshot = result
            loading = false
            return true
        } catch {
            guard request == token else { return false }
            failure = error as? RepositoryError ?? .unavailable
            loading = false
            return false
        }
    }
}
