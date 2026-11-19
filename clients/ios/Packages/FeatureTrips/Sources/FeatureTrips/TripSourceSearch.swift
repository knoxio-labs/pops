import AppCore
import Foundation

internal func tripSourceMatches(_ source: TripSource, query: String, places: [TripPlace]) -> Bool {
    var fields = [source.displayName(places: places), source.routeLabel(places: places)]
    switch source {
    case .stay(let stay):
        fields += [
            stay.address, stay.reference, stay.notes, stay.kind, stay.status,
            stay.timing.arrival, stay.timing.departure, stay.timing.checkIn,
            stay.timing.checkOut, stay.timing.timeZone,
        ].compactMap { $0 }
        fields += linkFields(stay.sourceLinks + stay.hostLinks + stay.documentLinks)
    case .event(let event):
        fields += [
            event.address, event.reference, event.notes, event.intention, event.arrangement,
            event.purchase, event.sourceUrl, event.ticketUrl, event.timing.start,
            event.timing.end, event.timing.startTime, event.timing.endTime,
            event.timing.timeZone,
        ].compactMap { $0 }
        fields += linkFields(
            event.sourceLinks + event.venueLinks + event.organiserLinks + event.documentLinks)
    case .journey(let journey):
        fields += [journey.name, journey.reference, journey.notes].compactMap { $0 }
        fields += linkFields(journey.sourceLinks)
        fields += journey.legs.flatMap { leg in
            [
                leg.mode, leg.reference, leg.service, leg.operator, leg.notes, leg.intention,
                leg.arrangement, leg.purchase, leg.from.sourceLabel, leg.from.local,
                leg.from.timeZone, leg.from.date, leg.to.sourceLabel, leg.to.local,
                leg.to.timeZone, leg.to.date,
            ]
            .compactMap { $0 }
                + linkFields(leg.sourceLinks)
                + linkFields(leg.from.sourceLinks ?? [])
                + linkFields(leg.to.sourceLinks ?? [])
        }
    }
    return tripSearchMatches(fields, query: query)
}

internal func tripRecordMatches(_ trip: TripRecord, query: String) -> Bool {
    let fields =
        [trip.name, trip.destination, trip.when, trip.notes].compactMap { $0 }
        + linkFields(trip.sourceLinks)
    return tripSearchMatches(fields, query: query)
}

internal func tripPlaceMatches(_ place: TripPlace, query: String) -> Bool {
    tripSearchMatches([place.name] + linkFields(place.sourceLinks), query: query)
}

internal func tripVisitMatches(_ visit: TripVisit, place: TripPlace?, query: String) -> Bool {
    let timing = visit.timing
    var fields = [
        visit.notes, timing.arrival, timing.departure,
        place?.name,
    ].compactMap { $0 }
    if let month = timing.month {
        fields += [String(month.year), String(month.month), month.part].compactMap { $0 }
    }
    if let duration = timing.duration {
        fields += [duration.min.map { String($0) }, duration.max.map { String($0) }, duration.unit]
            .compactMap { $0 }
    }
    fields += linkFields(visit.sourceLinks)
    return tripSearchMatches(fields, query: query)
}

internal enum TripsSearchFilter: String, CaseIterable, Sendable {
    case all
    case flights
    case stays
    case events
    case places
    case trips

    internal var title: String {
        switch self {
        case .all: "All"
        case .flights: "Flights"
        case .stays: "Stays"
        case .events: "Moments"
        case .places: "Places"
        case .trips: "Trips"
        }
    }

    internal var symbol: String {
        switch self {
        case .all: "sparkle.magnifyingglass"
        case .flights: "airplane"
        case .stays: "bed.double.fill"
        case .events: "calendar"
        case .places: "mappin.and.ellipse"
        case .trips: "map"
        }
    }

    internal func includes(_ source: TripSource) -> Bool {
        switch self {
        case .all: return true
        case .flights: return isFlightJourney(source)
        case .stays:
            if case .stay = source { return true }
            return false
        case .events:
            if case .event = source { return true }
            return false
        case .places, .trips: return false
        }
    }
}

internal func isFlightJourney(_ source: TripSource) -> Bool {
    guard case .journey(let journey) = source else { return false }
    return journey.legs.contains {
        $0.mode?.caseInsensitiveCompare("flight") == .orderedSame
    }
}

private func linkFields(_ links: [TripSourceLink]) -> [String] {
    links.flatMap { [$0.label, $0.uri].compactMap { $0 } }
}

private func tripSearchMatches(_ fields: [String], query: String) -> Bool {
    let normalizedQuery = normalizedSearchText(
        query.trimmingCharacters(in: .whitespacesAndNewlines))
    guard !normalizedQuery.isEmpty else { return true }
    return fields.contains { normalizedSearchText($0).contains(normalizedQuery) }
}

private func normalizedSearchText(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        .replacingOccurrences(of: "_", with: " ")
}
