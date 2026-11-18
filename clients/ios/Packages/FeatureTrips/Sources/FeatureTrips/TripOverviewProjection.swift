import AppCore
import Foundation

internal struct TripOverviewChapter: Identifiable, Equatable {
    internal let id: Int
    internal let title: String
    internal let timing: String
    internal let hasOpenDates: Bool
    internal let isCurrent: Bool
}

internal enum TripOverviewHeading: Equatable {
    case travelDay(String)
    case current(String)
    case upcoming(days: Int, source: String)
    case recorded(String)

    internal var title: String {
        switch self {
        case .travelDay(let title), .current(let title), .recorded(let title): title
        case .upcoming(let days, _): days == 0 ? "Later today" : "\(days) days to go"
        }
    }

    internal var context: String {
        switch self {
        case .travelDay: "Travel day"
        case .current: "Now"
        case .upcoming(_, let source): "Next · \(source)"
        case .recorded: "The trip"
        }
    }
}

internal enum TripOverviewFocusKind: Hashable {
    case now
    case next
}

internal enum TripOverviewFocusSection: Identifiable {
    case now([TripSource])
    case next([TripSource])

    internal var id: TripOverviewFocusKind {
        switch self {
        case .now: .now
        case .next: .next
        }
    }
}

internal enum TripOverviewAttention: Identifiable, Equatable {
    case openDates(visitID: Int, place: String)
    case openRouteSection(gapID: Int, hasPaths: Bool)

    internal var id: String {
        switch self {
        case .openDates(let visitID, _): "visit-\(visitID)"
        case .openRouteSection(let gapID, _): "gap-\(gapID)"
        }
    }

    internal var title: String {
        switch self {
        case .openDates(_, let place): "Dates open · \(place)"
        case .openRouteSection: "Open route section"
        }
    }

    internal var detail: String {
        switch self {
        case .openDates: "Choose when you’ll be there"
        case .openRouteSection(_, true): "Review the paths saved here"
        case .openRouteSection(_, false): "Add to this part of the route when ready"
        }
    }

    internal var visitID: Int? {
        guard case .openDates(let visitID, _) = self else { return nil }
        return visitID
    }
}

internal struct TripOverviewProjection {
    internal let heading: TripOverviewHeading
    internal let now: [TripSource]
    internal let next: [TripSource]
    internal let other: [TripSource]
    internal let chapters: [TripOverviewChapter]
    internal let attention: [TripOverviewAttention]

    internal var nextFocus: [TripSource] {
        guard let start = next.first?.start else { return [] }
        return next.filter { $0.start == start }
    }

    internal var focusSections: [TripOverviewFocusSection] {
        var sections: [TripOverviewFocusSection] = []
        if !now.isEmpty { sections.append(.now(now)) }
        if !nextFocus.isEmpty { sections.append(.next(nextFocus)) }
        return sections
    }

    internal init(
        snapshot: TripSnapshot, at instant: Date, zone: TimeZone,
        visibleSources: [TripSource], visibleVisits: [TripVisit],
        route: TripRouteSnapshot? = nil
    ) {
        let today = TripTodayProjection(snapshot: snapshot, at: instant)
        let visible = Set(visibleSources.map(\.id))
        now = today.now.filter { visible.contains($0.id) }
        next = today.next.filter { visible.contains($0.id) }
        other = today.other.filter { visible.contains($0.id) }
        let routeLine = route.map { TripPlanLineProjection(route: $0, snapshot: snapshot) }
        let chapterVisits =
            routeLine.map { line in
                line.root.compactMap { item -> TripVisit? in
                    guard case .visit(let visit, _, _) = item.content else { return nil }
                    return visit
                }
            } ?? visibleVisits
        chapters = tripOverviewChapters(snapshot: snapshot, visits: chapterVisits, now: now)
        attention =
            routeLine?.root.compactMap { item -> TripOverviewAttention? in
                switch item.content {
                case .visit(let visit, let place, _) where !tripChapterHasBounds(visit.timing):
                    return .openDates(visitID: visit.id, place: place)
                case .gap(let id):
                    return .openRouteSection(gapID: id, hasPaths: !item.paths.isEmpty)
                default:
                    return nil
                }
            } ?? []
        let selected = tripSources(snapshot).filter { visible.contains($0.id) }
        heading = tripOverviewHeading(
            snapshot: snapshot, at: instant, zone: zone, focus: (now, next),
            travel: tripTravelDaySource(selected, at: instant, zone: zone))
    }
}

private func tripOverviewChapters(
    snapshot: TripSnapshot, visits: [TripVisit], now: [TripSource]
) -> [TripOverviewChapter] {
    let currentVisits = Set(now.compactMap(\.visitID))
    return visits.map { visit in
        TripOverviewChapter(
            id: visit.id,
            title: snapshot.places.first { $0.id == visit.placeId }?.name ?? "Place unavailable",
            timing: tripChapterTiming(visit.timing),
            hasOpenDates: !tripChapterHasBounds(visit.timing),
            isCurrent: currentVisits.contains(visit.id))
    }
}

private func tripTravelDaySource(_ sources: [TripSource], at instant: Date, zone: TimeZone)
    -> TripSource?
{
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    return sources.first { source in
        guard case .journey(let journey) = source else { return false }
        return journey.legs.contains { leg in
            guard let departure = TripClock.instant(local: leg.from.local, zone: leg.from.timeZone)
            else { return false }
            return calendar.isDate(departure, inSameDayAs: instant)
        }
    }
}

private func tripOverviewHeading(
    snapshot: TripSnapshot, at instant: Date, zone: TimeZone,
    focus: (now: [TripSource], next: [TripSource]), travel: TripSource?
) -> TripOverviewHeading {
    if let current = focus.now.first {
        let place = current.visitID.flatMap { id in
            snapshot.visits.first { $0.id == id }
        }.flatMap { visit in
            snapshot.places.first { $0.id == visit.placeId }?.name
        }
        return .current(place ?? current.displayName(places: snapshot.places))
    }
    if let travel { return .travelDay(travel.displayName(places: snapshot.places)) }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    if let upcoming = focus.next.first, let start = upcoming.start,
        let days = calendar.dateComponents(
            [.day], from: calendar.startOfDay(for: instant),
            to: calendar.startOfDay(for: start)
        ).day
    {
        return .upcoming(days: days, source: upcoming.displayName(places: snapshot.places))
    }
    return .recorded(tripName(snapshot.trip))
}

private func tripChapterHasBounds(_ timing: TripVisitTiming) -> Bool {
    guard let arrival = timing.arrival, let departure = timing.departure,
        TripClock.day(arrival) != nil, TripClock.day(departure) != nil
    else { return false }
    return arrival <= departure
}

internal func tripChapterTiming(_ timing: TripVisitTiming) -> String {
    let dates: String?
    if let arrival = timing.arrival, let departure = timing.departure {
        dates = "\(TripClock.dayLabel(arrival)) – \(TripClock.dayLabel(departure))"
    } else if let arrival = timing.arrival {
        dates = "From \(TripClock.dayLabel(arrival))"
    } else if let departure = timing.departure {
        dates = "Until \(TripClock.dayLabel(departure))"
    } else {
        dates = nil
    }
    let facts = [
        dates, timing.month.map(tripChapterMonth),
        timing.duration.flatMap(tripVisitDurationLabel),
    ].compactMap { $0 }
    return facts.isEmpty ? "Dates not set" : facts.joined(separator: " · ")
}

private func tripChapterMonth(_ month: TripVisitMonth) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    let names = formatter.monthSymbols ?? []
    let label =
        names.indices.contains(month.month - 1)
        ? "\(names[month.month - 1]) \(month.year)" : "\(month.year)-\(month.month)"
    return [month.part, label].compactMap { $0 }.joined(separator: " · ")
}
