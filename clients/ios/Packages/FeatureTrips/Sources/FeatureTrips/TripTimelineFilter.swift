import AppCore
import Foundation

internal enum TripTimelineGrouping: String, CaseIterable, Identifiable {
    case sourceOrder = "Source order"
    case day = "Day"
    case month = "Month"

    internal var id: Self { self }
}

internal struct TripTimelineFilter {
    internal var query = ""
    internal var scope = TripBookingScope.all
    internal var grouping = TripTimelineGrouping.sourceOrder
    internal var includeAlternatives = true
    internal var fromDay: String?
    internal var throughDay: String?

    internal var invalidRange: Bool {
        if let fromDay, let throughDay { return fromDay > throughDay }
        return false
    }

    internal func sources(in snapshot: TripSnapshot, at now: Date, zone: TimeZone) -> [TripSource] {
        allTripSources(snapshot).filter { source in
            (includeAlternatives || !source.isAlternative(in: snapshot))
                && scope.includes(source, at: now)
                && tripSourceMatches(source, query: query, places: snapshot.places)
                && includes(source, zone: zone)
        }
    }

    internal func includes(_ source: TripSource, zone: TimeZone) -> Bool {
        let facts = tripCalendarFacts(sources: [source], zone: zone)
        let hasValidInterval =
            source.start.flatMap { start in source.end.map { start < $0 } } ?? false
        let orderedFloatingDays: Bool
        switch source {
        case .stay, .event:
            let days = source.days.filter { TripClock.day($0) != nil }
            orderedFloatingDays = days.count == 2 && days[0] <= days[1]
        case .journey: orderedFloatingDays = false
        }
        return includes(days: facts.map(\.day), spanning: hasValidInterval || orderedFloatingDays)
    }

    private func includes(days: [String], spanning: Bool) -> Bool {
        guard !days.isEmpty else { return true }
        guard !invalidRange else { return false }
        if spanning, let first = days.min(), let last = days.max() {
            return (throughDay.map { first <= $0 } ?? true)
                && (fromDay.map { last >= $0 } ?? true)
        }
        return days.contains(where: includes(day:))
    }

    internal func includes(day: String) -> Bool {
        !invalidRange && (fromDay.map { day >= $0 } ?? true)
            && (throughDay.map { day <= $0 } ?? true)
    }

    internal func visits(in snapshot: TripSnapshot, sources: [TripSource]) -> [TripVisit] {
        let visible = Set(sources.compactMap(\.visitID))
        return snapshot.visits.filter { visit in
            if visible.contains(visit.id) { return true }
            guard scope == .all else { return false }
            let words = [
                snapshot.places.first { $0.id == visit.placeId }?.name, visit.notes,
            ].compactMap { $0 }
            let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard
                search.isEmpty
                    || words.contains(where: { $0.localizedCaseInsensitiveContains(search) })
            else { return false }
            let days = [visit.timing.arrival, visit.timing.departure].compactMap { $0 }
                .filter { TripClock.day($0) != nil }
            return includes(days: days, spanning: days.count == 2 && days[0] <= days[1])
        }
    }
}

extension TripSource {
    internal var visitID: Int? {
        switch self {
        case .stay(let stay): stay.visitId
        case .event(let event): event.visitId
        case .journey: nil
        }
    }
}
