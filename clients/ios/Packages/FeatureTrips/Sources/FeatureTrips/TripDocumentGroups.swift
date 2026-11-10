import AppCore

internal struct TripDocumentGroup: Identifiable {
    internal let id: String
    internal let name: String
    internal let associations: [TripDocumentAssociation]

    internal var documentIDs: [Int] {
        var seen: Set<Int> = []
        return associations.map(\.documentId).filter { seen.insert($0).inserted }
    }
}

internal func tripDocumentGroups(_ snapshot: TripSnapshot) -> [TripDocumentGroup] {
    let associations = snapshot.documentAssociations
    var groups = [
        TripDocumentGroup(
            id: "trip", name: "Trip Documents",
            associations: associations.filter {
                $0.targetKind == "trip" && $0.targetId == snapshot.trip.id
            })
    ]
    groups += snapshot.visits.map { visit in
        TripDocumentGroup(
            id: "visit-\(visit.id)", name: tripVisitTitle(visit, places: snapshot.places),
            associations: associations.filter { documentBelongs($0, to: visit, snapshot: snapshot) }
        )
    }
    groups += snapshot.journeys.map { journey in
        TripDocumentGroup(
            id: "journey-\(journey.id)",
            name: TripSource.journey(journey).displayName(places: snapshot.places),
            associations: associations.filter {
                $0.targetKind == "journey" && $0.targetId == journey.id
            })
    }
    let assigned = Set(groups.flatMap(\.associations).map(\.id))
    groups.append(
        TripDocumentGroup(
            id: "other", name: "Other Documents",
            associations: associations.filter { !assigned.contains($0.id) }))
    return groups.filter { !$0.associations.isEmpty }
}

private func documentBelongs(
    _ association: TripDocumentAssociation, to visit: TripVisit, snapshot: TripSnapshot
) -> Bool {
    switch association.targetKind {
    case "visit": association.targetId == visit.id
    case "stay": snapshot.stays.first { $0.id == association.targetId }?.visitId == visit.id
    case "event": snapshot.events.first { $0.id == association.targetId }?.visitId == visit.id
    default: false
    }
}

internal func tripVisitTitle(_ visit: TripVisit, places: [TripPlace]) -> String {
    let name = places.first { $0.id == visit.placeId }?.name ?? "Place \(visit.placeId) unavailable"
    return "\(name) · Visit \(visit.id)"
}

internal func tripDocumentTarget(_ association: TripDocumentAssociation, snapshot: TripSnapshot)
    -> String
{
    switch association.targetKind {
    case "trip" where association.targetId == snapshot.trip.id: return tripName(snapshot.trip)
    case "visit":
        if let visit = snapshot.visits.first(where: { $0.id == association.targetId }) {
            return tripVisitTitle(visit, places: snapshot.places)
        }
    case "stay", "event", "journey":
        if let source = tripDocumentSource(association, snapshot: snapshot) {
            return source.displayName(places: snapshot.places)
        }
    default: break
    }
    return "\(association.targetKind) \(association.targetId) unavailable"
}

internal func tripDocumentSource(
    _ association: TripDocumentAssociation, snapshot: TripSnapshot
) -> TripSource? {
    switch association.targetKind {
    case "stay": snapshot.stays.first { $0.id == association.targetId }.map(TripSource.stay)
    case "event": snapshot.events.first { $0.id == association.targetId }.map(TripSource.event)
    case "journey":
        snapshot.journeys.first { $0.id == association.targetId }.map(TripSource.journey)
    default: nil
    }
}
