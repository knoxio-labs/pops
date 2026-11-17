import AppCore
import Foundation

internal struct TripPlanCalendarEntry: Identifiable {
    internal let id: String
    internal let item: TripPlanLineItem
    internal let labels: [String]
}

internal struct TripPlanCalendarStaySpan: Identifiable {
    internal let stay: TripStay
    internal let arrivalDay: String
    internal let departureDay: String
    internal var id: Int { stay.id }

    internal func covers(_ day: String) -> Bool { arrivalDay <= day && day < departureDay }
}

/// Places only exact recorded facts from the canonical root; path history and missing details stay separate.
internal struct TripPlanCalendarProjection {
    internal let line: TripPlanLineProjection
    internal let unallocated: [TripPlanLineItem]
    internal let recordedDays: [String]
    private let visits: [TripPlanLineItem]
    private let facts: [TripCalendarFact]
    private let stays: [TripPlanCalendarStaySpan]

    internal init(route: TripRouteSnapshot, snapshot: TripSnapshot?, zone: TimeZone) {
        let line = TripPlanLineProjection(route: route, snapshot: snapshot)
        self.line = line
        visits = line.root.filter {
            if case .visit = $0.content { return true }
            return false
        }
        let sources = line.root.flatMap { item -> [TripSource] in
            switch item.content {
            case .visit(_, _, let sources): sources
            case .source(let source): [source]
            default: []
            }
        }
        let facts = tripCalendarFacts(sources: sources, zone: zone)
        self.facts = facts
        stays = sources.compactMap { source in
            guard case .stay(let stay) = source,
                tripPlanCompleteOrderedBounds(stay.timing.arrival, stay.timing.departure),
                let arrival = facts.first(where: {
                    $0.source.id == source.id && $0.label == "Check-in"
                }),
                let departure = facts.first(where: {
                    $0.source.id == source.id && $0.label == "Check-out"
                }),
                arrival.day < departure.day
            else { return nil }
            if let start = source.start, let end = source.end, start >= end { return nil }
            return TripPlanCalendarStaySpan(
                stay: stay, arrivalDay: arrival.day, departureDay: departure.day)
        }
        recordedDays = Set(
            facts.map(\.day)
                + visits.flatMap { item -> [String] in
                    guard case .visit(let visit, _, _) = item.content else { return [] }
                    return [visit.timing.arrival, visit.timing.departure].compactMap { $0 }
                        .filter { TripClock.day($0) != nil }
                }
        ).sorted()
        unallocated = line.root.filter(tripPlanItemHasUnallocatedTiming)
    }

    internal func entries(on day: String) -> [TripPlanCalendarEntry] {
        guard TripClock.day(day) != nil else { return [] }
        let visitEntries = visits.compactMap { item -> TripPlanCalendarEntry? in
            guard case .visit(let visit, _, _) = item.content else { return nil }
            let labels = [
                visit.timing.arrival == day ? "Visit arrival" : nil,
                visit.timing.departure == day ? "Visit departure" : nil,
            ].compactMap { $0 }
            guard !labels.isEmpty else { return nil }
            return TripPlanCalendarEntry(id: "visit-\(visit.id)", item: item, labels: labels)
        }
        let dayFacts = facts.filter { $0.day == day }
        var sourceIDs = Set<String>()
        let sourceEntries = dayFacts.compactMap { fact -> TripPlanCalendarEntry? in
            guard sourceIDs.insert(fact.source.id).inserted else { return nil }
            return sourceEntry(
                fact.source, labels: dayFacts.filter { $0.source.id == fact.source.id }.map(\.label)
            )
        }
        let continuing = stays.compactMap { span -> TripPlanCalendarEntry? in
            guard !sourceIDs.contains(TripSource.stay(span.stay).id), span.covers(day)
            else { return nil }
            return sourceEntry(.stay(span.stay), labels: ["Stay continues"])
        }
        return visitEntries + sourceEntries + continuing
    }

    internal func staySpans(in days: [String]) -> [TripPlanCalendarStaySpan] {
        stays.filter { span in
            days.contains { span.covers($0) }
        }
    }

    private func sourceEntry(_ source: TripSource, labels: [String]) -> TripPlanCalendarEntry {
        TripPlanCalendarEntry(
            id: source.id,
            item: TripPlanLineItem(
                id: .recordedSource(source.id), content: .source(source), paths: []),
            labels: labels)
    }
}

private func tripPlanItemHasUnallocatedTiming(_ item: TripPlanLineItem) -> Bool {
    switch item.content {
    case .visit(let visit, _, let sources):
        !tripPlanCompleteOrderedBounds(visit.timing.arrival, visit.timing.departure)
            || sources.contains { tripPlanHasUnallocatedTiming($0) }
    case .source(let source): tripPlanHasUnallocatedTiming(source)
    case .gap, .missing, .unavailable: true
    }
}

private func tripPlanCompleteOrderedBounds(_ start: String?, _ end: String?) -> Bool {
    guard let start, let end, TripClock.day(start) != nil, TripClock.day(end) != nil else {
        return false
    }
    return start <= end
}

private func tripPlanHasUnallocatedTiming(_ source: TripSource) -> Bool {
    switch source {
    case .stay(let stay):
        return !tripPlanCompleteOrderedBounds(stay.timing.arrival, stay.timing.departure)
    case .event(let event):
        guard let start = event.timing.start, let end = event.timing.end else { return true }
        return TripClock.day(start) == nil || TripClock.day(end) == nil || start > end
    case .journey(let journey):
        return journey.legs.isEmpty
            || journey.legs.contains { leg in
                let from = leg.from.date ?? leg.from.local.map { String($0.prefix(10)) }
                let to = leg.to.date ?? leg.to.local.map { String($0.prefix(10)) }
                guard let from, let to else { return true }
                return TripClock.day(from) == nil || TripClock.day(to) == nil || from > to
            }
    }
}
