/// Resolved presentation of one route occurrence, retaining the exact source entry and references.
internal struct TripsBrowserRouteRow: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var entry: TripsBrowserRouteEntry
    internal var title: String
    internal var detail: String
    internal var source: TripsTodaySource?
    internal var visit: TripsBrowserVisit?
    internal var sourceIDs: [String]
    internal var contactIDs: [String]
    internal var missingReference: Bool
}

/// Projects authoritative route order, including repeated references and unresolved placeholders.
internal func tripsBrowserRouteRows(_ trip: TripsBrowserTrip) -> [TripsBrowserRouteRow] {
    trip.route.enumerated().map { index, entry in
        let identity = "route:\(index)"
        switch entry {
        case .visit(let id):
            let visit = trip.visits.first { $0.id == id }
            return .init(
                id: identity, entry: entry, title: visit?.name ?? "Visit unavailable",
                detail: visit.map { tripsBrowserVisitTimingLabel($0.timing) } ?? "", visit: visit,
                sourceIDs: visit?.sourceIDs ?? [],
                contactIDs: visit?.contactIDs ?? [], missingReference: visit == nil)
        case .transport(let id):
            let source = tripsTodaySource(trip.today, id: id)
            return .init(
                id: identity, entry: entry, title: source?.name ?? "Journey unavailable",
                detail: "", source: source, sourceIDs: [id],
                contactIDs: trip.contacts.filter { $0.sourceIDs.contains(id) }.map(\.id),
                missingReference: source?.kind != .journey)
        case .gap(let gap):
            return .init(
                id: identity, entry: entry, title: "Transport", detail: "",
                sourceIDs: [], contactIDs: [],
                missingReference:
                    !trip.visits.contains { $0.id == gap.fromVisitID }
                    || !trip.visits.contains { $0.id == gap.toVisitID })
        case .alternative(let alternative):
            return .init(
                id: identity, entry: entry, title: alternative.title, detail: alternative.detail,
                sourceIDs: alternative.sourceIDs, contactIDs: [],
                missingReference: alternative.sourceIDs.contains {
                    tripsTodaySource(trip.today, id: $0) == nil
                })
        }
    }
}

/// Immutable source issue; a missing reference is reported rather than resolved by matching a name.
internal struct TripsBrowserFinding: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var message: String
}

/// Checks explicit visit, arrangement, location, contact and document associations.
internal func tripsBrowserFindings(_ trip: TripsBrowserTrip) -> [TripsBrowserFinding] {
    let sourceIDs = Set(tripsTodayAllSources(trip.today).map(\.id))
    let visitIDs = Set(trip.visits.map(\.id))
    let placeIDs = Set(trip.places.map(\.id))
    let contactIDs = Set(trip.contacts.map(\.id))
    var findings = tripsBrowserRouteRows(trip).filter(\.missingReference).map {
        TripsBrowserFinding(id: $0.id, message: "\($0.title): a route reference is unavailable.")
    }
    for visit in trip.visits {
        if !tripsBrowserValidVisitTiming(visit.timing) || !placeIDs.contains(visit.placeID)
            || !Set(visit.sourceIDs).isSubset(of: sourceIDs)
            || !Set(visit.contactIDs).isSubset(of: contactIDs)
        {
            findings.append(
                .init(id: visit.id, message: "\(visit.name): a linked record is unavailable."))
        }
    }
    for document in trip.documents {
        if !Set(document.sourceIDs).isSubset(of: sourceIDs)
            || !Set(document.visitIDs).isSubset(of: visitIDs)
        {
            findings.append(
                .init(
                    id: document.id, message: "\(document.title): a linked record is unavailable."))
        }
    }
    for contact in trip.contacts where !Set(contact.sourceIDs).isSubset(of: sourceIDs) {
        findings.append(
            .init(id: contact.id, message: "\(contact.name): a linked arrangement is unavailable."))
    }
    for idea in trip.ideas {
        if let placeID = idea.placeID, !placeIDs.contains(placeID) {
            findings.append(.init(id: idea.id, message: "\(idea.title): location unavailable."))
        }
    }
    return findings
}
