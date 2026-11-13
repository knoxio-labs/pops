import Foundation

extension TripOfflineReadCoordinator {
    internal func begin(_ resource: TripOfflineReadResource) throws -> UUID {
        try assertCurrent()
        let token = UUID()
        requests[resource] = token
        provenance[resource] = nil
        return token
    }

    internal func check(_ token: UUID, _ resource: TripOfflineReadResource) throws {
        try assertCurrent()
        guard requests[resource] == token else { throw CancellationError() }
    }

    internal func assertCurrent() throws {
        try Task.checkCancellation()
        try context.assertCurrent()
        guard store.owner == owner else { throw TripDocumentOfflineError.ownerChanged }
    }

    internal func navigation() throws -> TripDocumentOfflineNavigation? {
        try assertCurrent()
        let value = try store.loadNavigation()
        try assertCurrent()
        return value
    }

    internal func invalidated(
        _ resource: TripOfflineReadResource, in navigation: TripDocumentOfflineNavigation
    ) -> Bool {
        rejectedResources.contains(resource)
            || navigation.invalidatedResources?.contains(resource) == true
    }

    internal func verified(_ resource: TripOfflineReadResource, at date: Date) {
        rejectedResources.remove(resource)
        provenance[resource] = .remote(verifiedAt: date)
    }

    internal func fallback(
        after error: any Error, resource: TripOfflineReadResource
    ) throws -> TripDocumentOfflineNavigation {
        try assertCurrent()
        guard TripOfflineReadPolicy.permitsLastVerifiedRead(after: error) else {
            let cancelledURL = (error as? URLError)?.code == .cancelled
            let cancelledTransport: Bool
            if let repositoryError = error as? RepositoryError,
                case .transport(let failure) = repositoryError
            {
                cancelledTransport = failure.urlErrorCode == .cancelled
            } else {
                cancelledTransport = false
            }
            if !(error is CancellationError), !cancelledURL, !cancelledTransport {
                try invalidate(resource)
            }
            throw error
        }
        guard let value = try navigation(), !invalidated(resource, in: value) else { throw error }
        return value
    }

    internal func update(
        _ transform: (TripDocumentOfflineNavigation) throws -> TripDocumentOfflineNavigation
    ) throws {
        let previous = try navigation()
        let empty = TripDocumentOfflineNavigation(
            owner: owner, catalogue: nil, trips: [], originals: [], selectedTripID: nil)
        let next = try transform(previous ?? empty)
        try assertCurrent()
        try store.replaceNavigation(next, replacing: previous?.generation)
        try assertCurrent()
    }

    internal func invalidate(_ resource: TripOfflineReadResource) throws {
        rejectedResources.insert(resource)
        if case .document(let id) = resource { rejectedResources.insert(.file(id)) }
        try update { previous in
            var blocked = previous.invalidatedResources ?? []
            blocked.insert(resource)
            if case .document(let id) = resource { blocked.insert(.file(id)) }
            return previous.replacing(invalidations: blocked)
        }
        provenance[resource] = nil
    }
}

extension TripDocumentOfflineNavigation {
    internal func replacing(
        catalogue: VerifiedTripCatalogue? = nil, trips: [VerifiedTripSnapshot]? = nil,
        originals: [VerifiedDocumentOriginal]? = nil, selectedTripID: Int? = nil,
        invalidations: Set<TripOfflineReadResource>? = nil
    ) -> TripDocumentOfflineNavigation {
        let blocked = invalidations ?? invalidatedResources ?? []
        let snapshots = trips ?? self.trips
        let records = catalogue ?? self.catalogue
        let selection = selectedTripID ?? self.selectedTripID
        let selectable =
            selection.map { id in
                !blocked.contains(.trip(id))
                    && (snapshots.contains { $0.snapshot.trip.id == id }
                        || records?.trips.contains { $0.id == id } == true)
            } ?? false
        return TripDocumentOfflineNavigation(
            owner: owner, catalogue: records, trips: snapshots,
            originals: originals ?? self.originals, selectedTripID: selectable ? selection : nil,
            invalidatedResources: blocked)
    }
}
