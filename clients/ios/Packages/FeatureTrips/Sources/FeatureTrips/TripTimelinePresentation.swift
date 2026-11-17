import AppCore
import Foundation

internal struct TripTimelineVisit: Identifiable {
    internal let visit: TripVisit
    internal let placeName: String
    internal let sources: [TripSource]

    internal var id: String { "visit-\(visit.id)" }
}

internal enum TripTimelineEntry: Identifiable {
    case visit(TripTimelineVisit)
    case source(TripSource)

    internal var id: String {
        switch self {
        case .visit(let visit): visit.id
        case .source(let source): source.id
        }
    }
}

internal struct TripTimelineGroup: Identifiable {
    internal let id: String
    internal let title: String
    internal let entries: [TripTimelineEntry]
}

internal func tripTimelineGroups(
    snapshot: TripSnapshot,
    sources: [TripSource],
    visits: [TripVisit],
    grouping: TripTimelineGrouping,
    zone: TimeZone
) -> [TripTimelineGroup] {
    let visitsWithSources = visits.map { visit in
        TripTimelineVisit(
            visit: visit,
            placeName: snapshot.places.first { $0.id == visit.placeId }?.name
                ?? "Place unavailable",
            sources: sources.filter { $0.visitID == visit.id })
    }
    let linkedSourceIDs = Set(visitsWithSources.flatMap { $0.sources.map(\.id) })
    let unlinkedSources = sources.filter { !linkedSourceIDs.contains($0.id) }

    if grouping == .sourceOrder {
        return sourceOrderGroups(visits: visitsWithSources, sources: unlinkedSources)
    }

    let entries =
        visitsWithSources.map(TripTimelineEntry.visit)
        + unlinkedSources.map(TripTimelineEntry.source)
    let dated = entries.enumerated().map { index, entry in
        TimelineEntryDate(entry: entry, index: index, zone: zone)
    }
    let ordered = dated.sorted(by: timelineOrder)
    var groups: [TripTimelineGroup] = []
    for item in ordered {
        let key = item.day.map { grouping == .month ? String($0.prefix(7)) : $0 }
        let id = key.map { grouping == .month ? "month-\($0)" : "day-\($0)" } ?? "undated"
        let title =
            key.map { grouping == .month ? tripTimelineMonthTitle($0) : TripClock.dayLabel($0) }
            ?? "Dates to decide"
        if let last = groups.last, last.id == id {
            groups[groups.count - 1] = TripTimelineGroup(
                id: last.id, title: last.title, entries: last.entries + [item.entry])
        } else {
            groups.append(TripTimelineGroup(id: id, title: title, entries: [item.entry]))
        }
    }
    return groups
}

private struct TimelineEntryDate {
    let entry: TripTimelineEntry
    let index: Int
    let day: String?
    let instant: Date?

    init(entry: TripTimelineEntry, index: Int, zone: TimeZone) {
        self.entry = entry
        self.index = index
        let facts: [TripCalendarFact]
        switch entry {
        case .visit(let visit):
            let sources = tripCalendarFacts(sources: visit.sources, zone: zone)
            let visitDays = [visit.visit.timing.arrival, visit.visit.timing.departure]
                .compactMap { $0 }
                .filter { TripClock.day($0) != nil }
            let day = (visitDays + sources.map(\.day)).min()
            self.day = day
            instant = sources.compactMap(\.instant).min()
            return
        case .source(let source):
            facts = tripCalendarFacts(sources: [source], zone: zone)
        }
        day = facts.first?.day
        instant = facts.first?.instant
    }
}

private func timelineOrder(_ left: TimelineEntryDate, _ right: TimelineEntryDate) -> Bool {
    switch (left.day, right.day) {
    case (let leftDay?, let rightDay?) where leftDay != rightDay:
        return leftDay < rightDay
    case (_?, nil): return true
    case (nil, _?): return false
    default: break
    }
    switch (left.instant, right.instant) {
    case (let leftInstant?, let rightInstant?) where leftInstant != rightInstant:
        return leftInstant < rightInstant
    case (_?, nil): return true
    case (nil, _?): return false
    default: return left.index < right.index
    }
}

private func sourceOrderGroups(
    visits: [TripTimelineVisit], sources: [TripSource]
) -> [TripTimelineGroup] {
    var groups: [TripTimelineGroup] = []
    if !visits.isEmpty {
        groups.append(
            TripTimelineGroup(
                id: "places", title: "Places", entries: visits.map(TripTimelineEntry.visit)))
    }
    let journeys = sources.filter { if case .journey = $0 { true } else { false } }
    if !journeys.isEmpty {
        groups.append(
            TripTimelineGroup(
                id: "journeys", title: "Journeys", entries: journeys.map(TripTimelineEntry.source)))
    }
    let otherSources = sources.filter { if case .journey = $0 { false } else { true } }
    if !otherSources.isEmpty {
        groups.append(
            TripTimelineGroup(
                id: "other-plans", title: "Other plans",
                entries: otherSources.map(TripTimelineEntry.source)))
    }
    return groups
}

private func tripTimelineMonthTitle(_ key: String) -> String {
    guard let date = TripClock.day("\(key)-01") else { return key }
    var style = Date.FormatStyle.dateTime.month(.wide).year()
    style.timeZone = .gmt
    return date.formatted(style)
}
