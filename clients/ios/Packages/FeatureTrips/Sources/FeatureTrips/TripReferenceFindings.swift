import AppCore

internal struct TripReferenceFinding: Identifiable, Equatable {
    internal let id: String
    internal let message: String
}

internal func tripReferenceFindings(_ snapshot: TripSnapshot) -> [TripReferenceFinding] {
    let places = Set(snapshot.places.map(\.id))
    let visits = Set(snapshot.visits.map(\.id))
    let journeys = Set(snapshot.journeys.map(\.id))
    let missingPlaces = snapshot.visits.filter { !places.contains($0.placeId) }.map {
        TripReferenceFinding(
            id: "visit-\($0.id)", message: "Visit \($0.id): place \($0.placeId) unavailable")
    }
    let missingVisits = snapshot.stays.compactMap { stay -> TripReferenceFinding? in
        guard let visit = stay.visitId, !visits.contains(visit) else { return nil }
        return TripReferenceFinding(
            id: "stay-\(stay.id)", message: "\(stay.name ?? "Stay"): visit \(visit) unavailable")
    }
    let missingEvents = snapshot.events.compactMap { event -> TripReferenceFinding? in
        guard let visit = event.visitId, !visits.contains(visit) else { return nil }
        return TripReferenceFinding(
            id: "event-\(event.id)", message: "\(event.name ?? "Event"): visit \(visit) unavailable"
        )
    }
    let missingJourneys = snapshot.journeyGroups.flatMap { group in
        ([group.currentJourneyId] + group.alternativeJourneyIds).filter { !journeys.contains($0) }
            .map {
                TripReferenceFinding(
                    id: "group-\(group.id)-\($0)", message: "Journey \($0) unavailable")
            }
    }
    return missingPlaces + missingVisits + missingEvents + missingJourneys
}
