import AppCore
import Foundation
import Observation

@MainActor
@Observable
internal final class TripsModel {
    internal private(set) var trips: [TripRecord] = []
    internal private(set) var snapshot: TripSnapshot?
    internal private(set) var selectedID: Int?
    internal private(set) var loading = false
    internal private(set) var failure: RepositoryError?
    internal var tab = TripsTab.trips {
        didSet {
            if tab != oldValue {
                navigationIntent = UUID()
                source = nil
            }
        }
    }
    internal var source: TripSource?
    @ObservationIgnored internal private(set) var navigationTask: Task<Void, Never>?
    private let repository: any TripsReading
    private var request = UUID()
    private var navigationIntent = UUID()

    internal init(repository: any TripsReading) { self.repository = repository }

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
            if let id = selectedID, records.contains(where: { $0.id == id }) {
                await select(id)
            } else {
                selectedID = nil
                snapshot = nil
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
        snapshot = nil
        failure = nil
        loading = true
        do {
            let result = try await repository.trip(id: id)
            guard request == token else { return false }
            guard result == nil || result?.trip.id == id else {
                throw RepositoryError.contractMismatch
            }
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
