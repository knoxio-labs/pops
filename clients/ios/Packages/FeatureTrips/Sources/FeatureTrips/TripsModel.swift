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
    private let repository: any TripsReading
    private var request = UUID()

    internal init(repository: any TripsReading) { self.repository = repository }

    internal func canonicalSource(_ source: TripSource) -> TripSource? {
        guard let snapshot, snapshot.trip.id == source.tripID else { return nil }
        return allTripSources(snapshot).first { $0.id == source.id }
    }

    internal func load() async {
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
        let token = UUID()
        request = token
        selectedID = id
        snapshot = nil
        failure = nil
        loading = true
        do {
            let result = try await repository.trip(id: id)
            guard request == token else { return }
            guard result == nil || result?.trip.id == id else {
                throw RepositoryError.contractMismatch
            }
            snapshot = result
            loading = false
        } catch {
            guard request == token else { return }
            failure = error as? RepositoryError ?? .unavailable
            loading = false
        }
    }
}
