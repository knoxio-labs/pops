/// One requested calendar day with actual source boundaries and explicit validation findings.
internal struct TripsBrowserCalendarDay: Equatable, Sendable {
    internal var day: String
    internal var entries: [TripsTodayCommitment]
    internal var findings: [TripsBrowserFinding]
}

/// Projects any valid calendar day in the trip's display zone; date-only records keep nil clocks.
internal func tripsBrowserCalendar(_ trip: TripsBrowserTrip, day: String) -> TripsBrowserCalendarDay
{
    guard tripsTodayValidDay(day) else {
        return .init(
            day: day, entries: [],
            findings: [.init(id: "day", message: "Choose a valid calendar day.")])
    }
    guard tripsTodayTimeZone(trip.today.displayZone) != nil else {
        return .init(
            day: day, entries: [],
            findings: [.init(id: "zone", message: "Display time zone unavailable.")])
    }
    return .init(day: day, entries: tripsTodayCommitments(trip.today, day: day), findings: [])
}

/// Trip-wide unresolved timing and lodging issues, presented once rather than assigned to arbitrary days.
internal func tripsBrowserTimingFindings(_ trip: TripsBrowserTrip) -> [TripsBrowserFinding] {
    tripsTodayProjection(trip.today).findings.map {
        TripsBrowserFinding(id: $0.id, message: $0.message)
    }
}

/// Source and exact visit-boundary shortcuts; the reference day is used only when none exist.
/// These are not a limit on the days accepted by the calendar projection.
internal func tripsBrowserCalendarDays(_ trip: TripsBrowserTrip) -> [String] {
    var days = trip.today.events.compactMap { event in
        event.day.flatMap { tripsTodayValidDay($0) ? $0 : nil }
    }
    for source in tripsTodayAllSources(trip.today) {
        for clock in tripsBrowserSourceClocks(source) {
            if tripsTodayClockInstant(clock) != nil,
                let day = tripsTodayDay(clock.at, zone: trip.today.displayZone)
            {
                days.append(day)
            }
        }
    }
    for visit in trip.visits where tripsBrowserValidVisitTiming(visit.timing) {
        if case .dates(let from, let to) = visit.timing { days += [from, to].compactMap { $0 } }
    }
    if days.isEmpty, let today = tripsTodayDay(trip.today.now, zone: trip.today.displayZone) {
        days.append(today)
    }
    return Set(days).sorted()
}

private func tripsBrowserSourceClocks(_ source: TripsTodaySource) -> [TripsTodayClock] {
    switch source {
    case .stay(let stay): [stay.from, stay.to].compactMap { $0 }
    case .journey(let journey):
        journey.legs.flatMap { [$0.departure, $0.arrival].compactMap { $0 } }
    case .event(let event): [event.start, event.end].compactMap { $0 }
    }
}
