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

internal struct TripOverviewProjection {
    internal let heading: TripOverviewHeading
    internal let now: [TripSource]
    internal let next: [TripSource]
    internal let chapters: [TripOverviewChapter]

    internal var nextFocus: [TripSource] {
        guard let start = next.first?.start else { return [] }
        return next.filter { $0.start == start }
    }

    internal var chaptersFollowFocus: Bool {
        if !now.isEmpty { return true }
        if case .travelDay = heading { return true }
        return false
    }

    internal init(
        snapshot: TripSnapshot, at instant: Date, zone: TimeZone,
        visibleSources: [TripSource], visibleVisits: [TripVisit]
    ) {
        let today = TripTodayProjection(snapshot: snapshot, at: instant)
        let visible = Set(visibleSources.map(\.id))
        now = today.now.filter { visible.contains($0.id) }
        next = today.next.filter { visible.contains($0.id) }
        chapters = tripOverviewChapters(snapshot: snapshot, visits: visibleVisits, now: now)
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
