import AppCore
import Foundation

internal struct TripCalendarFact: Identifiable {
    internal let id: String
    internal let day: String
    internal let instant: Date?
    internal let label: String
    internal let source: TripSource
}

internal func tripCalendarFacts(_ snapshot: TripSnapshot, zone: TimeZone) -> [TripCalendarFact] {
    tripCalendarFacts(sources: tripSources(snapshot), zone: zone)
}

internal func tripCalendarFacts(sources: [TripSource], zone: TimeZone) -> [TripCalendarFact] {
    sources.flatMap { source -> [TripCalendarFact] in
        switch source {
        case .stay(let stay):
            return [
                calendarFact(
                    source, day: stay.timing.arrival, instant: source.start, label: "Check-in",
                    zone: zone),
                calendarFact(
                    source, day: stay.timing.departure, instant: source.end, label: "Check-out",
                    zone: zone),
            ].compactMap { $0 }
        case .event(let event):
            return [
                calendarFact(
                    source, day: event.timing.start, instant: source.start, label: "Start",
                    zone: zone),
                calendarFact(
                    source, day: event.timing.end, instant: source.end, label: "End", zone: zone),
            ].compactMap { $0 }
        case .journey(let journey):
            return journey.legs.flatMap { leg in
                [
                    endpointFact(
                        source, endpoint: leg.from, label: "Departure · \(leg.id)", zone: zone),
                    endpointFact(
                        source, endpoint: leg.to, label: "Arrival · \(leg.id)", zone: zone),
                ].compactMap { $0 }
            }
        }
    }.sorted { left, right in
        if left.day != right.day { return left.day < right.day }
        switch (left.instant, right.instant) {
        case (let lhs?, let rhs?) where lhs != rhs: return lhs < rhs
        case (_?, nil): return true
        case (nil, _?): return false
        default: return left.id < right.id
        }
    }
}

private func endpointFact(
    _ source: TripSource, endpoint: TripEndpoint, label: String, zone: TimeZone
) -> TripCalendarFact? {
    let instant = TripClock.instant(local: endpoint.local, zone: endpoint.timeZone)
    let day = endpoint.date ?? endpoint.local.map { String($0.prefix(10)) }
    return calendarFact(source, day: day, instant: instant, label: label, zone: zone)
}

private func calendarFact(
    _ source: TripSource, day: String?, instant: Date?, label: String, zone: TimeZone
) -> TripCalendarFact? {
    let calendarDay: String
    if let instant {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.year, .month, .day], from: instant)
        guard let year = parts.year, let month = parts.month, let date = parts.day else {
            return nil
        }
        calendarDay = String(format: "%04d-%02d-%02d", year, month, date)
    } else {
        guard let day, TripClock.day(day) != nil else { return nil }
        calendarDay = day
    }
    return TripCalendarFact(
        id: "\(source.id)-\(label)", day: calendarDay, instant: instant, label: label,
        source: source)
}
