import Foundation
import Observation

/// Owner-bound online reads with explicit last-verified fallback and protected durable navigation.
/// It never sends writes, guesses associations or treats metadata as a downloaded original.
@MainActor
@Observable
public final class TripOfflineReadCoordinator: TripsReading, DocumentsReading, TripOfflineSelection
{
    /// The immutable pairing namespace shared by every reader and persisted record in this context.
    public let owner: TripDocumentOfflineOwner
    /// Per-resource provenance; a fallback retains the original verification date.
    public internal(set) var provenance: [TripOfflineReadResource: TripOfflineReadProvenance] = [:]
    internal let store: any TripDocumentOfflineStore
    internal let context: TripOfflineReadContext
    internal let remoteTrips: any TripsReading
    internal let remoteDocuments: any DocumentsReading
    internal let now: @MainActor () -> Date
    internal var requests: [TripOfflineReadResource: UUID] = [:]
    internal var rejectedResources: Set<TripOfflineReadResource> = []

    /// Both readers must already be authenticated for this exact owner. The context additionally fences
    /// pairing lifetime changes while requests are suspended, including an A→B→A transition.
    public init(
        trips: any TripsReading, documents: any DocumentsReading,
        store: any TripDocumentOfflineStore, context: TripOfflineReadContext,
        now: @escaping @MainActor () -> Date = { Date() }
    ) {
        owner = store.owner
        self.store = store
        self.context = context
        remoteTrips = trips
        remoteDocuments = documents
        self.now = now
    }

    /// Reads the complete remote catalogue, falling back only after an eligible unavailability failure.
    public func trips() async throws -> [TripRecord] {
        let resource = TripOfflineReadResource.catalogue
        let token = try begin(resource)
        let records: [TripRecord]
        do {
            records = try await remoteTrips.trips()
        } catch {
            try check(token, resource)
            let navigation = try fallback(after: error, resource: resource)
            guard let catalogue = navigation.catalogue
            else { throw error }
            provenance[resource] = .lastVerified(verifiedAt: catalogue.verifiedAt)
            return catalogue.trips.filter { !invalidated(.trip($0.id), in: navigation) }
        }
        try check(token, resource)
        guard records.allSatisfy({ $0.id > 0 }), Set(records.map(\.id)).count == records.count
        else {
            try invalidate(resource)
            throw RepositoryError.contractMismatch
        }
        let date = now()
        try update { previous in
            let ids = Set(records.map(\.id))
            var blocked = previous.invalidatedResources ?? []
            blocked.remove(resource)
            for old in previous.trips where !ids.contains(old.snapshot.trip.id) {
                blocked.insert(.trip(old.snapshot.trip.id))
            }
            return previous.replacing(
                catalogue: VerifiedTripCatalogue(trips: records, verifiedAt: date),
                trips: previous.trips.filter { ids.contains($0.snapshot.trip.id) },
                invalidations: blocked)
        }
        verified(resource, at: date)
        return records
    }

    /// A successful missing read is persisted before returning nil and cannot be revived by a later outage.
    public func trip(id: Int) async throws -> TripSnapshot? {
        guard id > 0 else { throw RepositoryError.requestRejected }
        let resource = TripOfflineReadResource.trip(id)
        let token = try begin(resource)
        let snapshot: TripSnapshot?
        do {
            snapshot = try await remoteTrips.trip(id: id)
        } catch {
            try check(token, resource)
            let navigation = try fallback(after: error, resource: resource)
            guard let saved = navigation.trips.first(where: { $0.snapshot.trip.id == id })
            else { throw error }
            provenance[resource] = .lastVerified(verifiedAt: saved.verifiedAt)
            return saved.snapshot
        }
        try check(token, resource)
        guard let snapshot else {
            try invalidate(resource)
            return nil
        }
        guard snapshot.trip.id == id else {
            try invalidate(resource)
            throw RepositoryError.contractMismatch
        }
        let date = now()
        try update { previous in
            var trips = previous.trips.filter { $0.snapshot.trip.id != id }
            trips.append(VerifiedTripSnapshot(snapshot: snapshot, verifiedAt: date))
            var blocked = previous.invalidatedResources ?? []
            blocked.remove(resource)
            return previous.replacing(trips: trips, invalidations: blocked)
        }
        verified(resource, at: date)
        return snapshot
    }

    /// Restores only a previously explicit selection whose source has not been invalidated.
    public func selectedTripID() throws -> Int? {
        guard let navigation = try navigation(), let id = navigation.selectedTripID,
            !invalidated(.trip(id), in: navigation)
        else { return nil }
        return id
    }

    /// Ends this view's read lifetime. A later view must create its own coordinator instead of reviving this one.
    public func retire() {
        context.retire()
        provenance.removeAll()
    }

    /// Persists a UI-accepted selection; starting or failing a request does not select a cached Trip.
    public func selectTrip(_ id: Int) throws {
        try update { previous in
            guard previous.trips.contains(where: { $0.snapshot.trip.id == id }),
                !invalidated(.trip(id), in: previous)
            else { throw TripDocumentOfflineError.invalidRecord }
            return previous.replacing(selectedTripID: id)
        }
    }
}
