import Foundation

/// Search scope is an explicit user selection; history is never silently omitted from all trips.
internal enum TripsBrowserSearchScope: String, CaseIterable, Sendable {
    case selectedTrip, allTrips
}

/// Actual catalogue source categories, rather than classifications inferred from search text.
internal enum TripsBrowserSearchKind: String, CaseIterable, Sendable {
    case trip, place, visit, booking, contact, document, idea

    /// Search result category title.
    internal var title: String {
        switch self {
        case .trip: "Trip"
        case .place: "Place"
        case .visit: "Visit"
        case .booking: "Booking"
        case .contact: "Contact"
        case .document: "Document"
        case .idea: "Idea"
        }
    }
}

/// A search hit retains trip and original record identity, including equal names across history.
internal struct TripsBrowserSearchResult: Equatable, Sendable, Identifiable {
    internal var tripID: String
    internal var recordID: String
    internal var kind: TripsBrowserSearchKind
    internal var title: String
    internal var subtitle: String

    /// Presentation identity is scoped by trip and source kind; recordID stays unchanged.
    internal var id: String { "\(tripID):\(kind.rawValue):\(recordID)" }
}

/// Searches recorded facts with deterministic case/diacritic folding and explicit scope/type filters.
internal func tripsBrowserSearch(
    _ state: TripsBrowserState, query: String, scope: TripsBrowserSearchScope,
    kind: TripsBrowserSearchKind? = nil
) -> [TripsBrowserSearchResult] {
    let trips = state.trips.filter { scope == .allTrips || $0.id == state.selectedTripID }
    let needle = tripsBrowserSearchText(query.trimmingCharacters(in: .whitespacesAndNewlines))
    return trips.flatMap { trip in
        tripsBrowserSearchRecords(trip).filter { record in
            (kind == nil || record.result.kind == kind)
                && (needle.isEmpty || tripsBrowserSearchText(record.text).contains(needle))
        }.map(\.result)
    }
}

private func tripsBrowserSearchText(_ value: String) -> String {
    value.folding(
        options: [.caseInsensitive, .diacriticInsensitive],
        locale: Locale(identifier: "en_US_POSIX"))
}

private struct TripsBrowserSearchRecord {
    let result: TripsBrowserSearchResult
    let text: String
}

private func tripsBrowserSearchRecords(_ trip: TripsBrowserTrip) -> [TripsBrowserSearchRecord] {
    func record(_ id: String, _ kind: TripsBrowserSearchKind, _ title: String, _ text: String)
        -> TripsBrowserSearchRecord
    {
        .init(
            result: .init(
                tripID: trip.id, recordID: id, kind: kind, title: title, subtitle: trip.name),
            text: text)
    }
    let trips = [record(trip.id, .trip, trip.name, trip.name + " " + trip.when)]
    let places = trip.places.map { record($0.id, .place, $0.name, $0.name) }
    let visits = trip.visits.map { visit in
        let place = trip.places.first { $0.id == visit.placeID }?.name ?? ""
        return record(
            visit.id, .visit, visit.name,
            visit.name + " " + tripsBrowserVisitTimingLabel(visit.timing) + " " + place)
    }
    let bookings = tripsTodayAllSources(trip.today).map { source in
        record(source.id, .booking, source.name, tripsBrowserBookingText(source))
    }
    let contacts = trip.contacts.map { contact in
        let facts = contact.methods + contact.addresses
        let text = [contact.name, contact.notes] + facts.flatMap { [$0.label, $0.value] }
        return record(contact.id, .contact, contact.name, text.joined(separator: " "))
    }
    let documents = trip.documents.map {
        record(
            $0.id, .document, $0.title,
            [$0.title, $0.fileName, $0.mimeType, $0.notes].joined(separator: " "))
    }
    let ideas = trip.ideas.map { idea in
        let place = trip.places.first { $0.id == idea.placeID }?.name ?? ""
        return record(
            idea.id, .idea, idea.title, [idea.title, idea.notes, place].joined(separator: " "))
    }
    return trips + places + visits + bookings + contacts + documents + ideas
}

private func tripsBrowserBookingText(_ source: TripsTodaySource) -> String {
    let essentials = source.essentials
    let contact = essentials.contact.map { [$0.name, $0.methodLabel, $0.method] } ?? []
    let legs: [String]
    if case .journey(let journey) = source { legs = journey.legs.map(\.name) } else { legs = [] }
    return ([source.name, essentials.reference ?? "", essentials.address ?? ""] + contact + legs)
        .joined(separator: " ")
}
