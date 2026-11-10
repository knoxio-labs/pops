import AppCore

internal func tripSnapshotMatches(_ value: TripSnapshot, id: Int) -> Bool {
    id > 0 && value.trip.id == id
        && uniqueTripIDs(value.places.map(\.id))
        && uniqueTripIDs(value.visits.map(\.id))
        && uniqueTripIDs(value.stays.map(\.id))
        && uniqueTripIDs(value.events.map(\.id))
        && uniqueTripIDs(value.documentAssociations.map(\.id))
        && uniqueTripIDs(value.journeyGroups.map(\.id))
        && uniqueTripIDs(value.journeys.map(\.id))
        && value.visits.allSatisfy { $0.id > 0 && $0.tripId == id }
        && value.stays.allSatisfy { $0.id > 0 && $0.tripId == id }
        && value.events.allSatisfy { $0.id > 0 && $0.tripId == id }
        && value.documentAssociations.allSatisfy {
            $0.id > 0 && $0.tripId == id && $0.documentId > 0 && $0.targetId > 0
        }
        && value.journeyGroups.allSatisfy { $0.id > 0 && $0.tripId == id }
        && value.journeys.allSatisfy { journey in
            journey.id > 0 && journey.tripId == id
                && uniqueTripIDs(journey.legs.map(\.id))
                && journey.legs.allSatisfy { $0.id > 0 && $0.journeyId == journey.id }
        }
}

private func uniqueTripIDs(_ values: [Int]) -> Bool {
    values.allSatisfy { $0 > 0 } && Set(values).count == values.count
}
