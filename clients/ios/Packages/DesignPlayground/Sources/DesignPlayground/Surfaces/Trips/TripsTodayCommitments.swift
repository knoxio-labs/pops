/// Projects actual boundaries and continuations for one validated display day.
internal func tripsTodayCommitments(_ state: TripsTodayState, day: String) -> [TripsTodayCommitment]
{
    let stays = state.stays.flatMap { stay in
        tripsTodayEntries(.stay(stay), clocks: (stay.from, stay.to), state: state, day: day)
    }
    let journeys = state.journeys.flatMap { journey in
        journey.legs.flatMap { leg in
            tripsTodayEntries(
                .journey(journey), clocks: (leg.departure, leg.arrival),
                state: state, day: day, legID: leg.id)
        }
    }
    let events = state.events.flatMap { event in
        tripsTodayEventEntries(event, state: state, day: day)
    }
    return (stays + journeys + events).sorted { left, right in
        let leftAt = tripsTodayClockInstant(left.clock)
        let rightAt = tripsTodayClockInstant(right.clock)
        if let leftAt, let rightAt, leftAt != rightAt { return leftAt < rightAt }
        if leftAt == nil && rightAt != nil { return true }
        if leftAt != nil && rightAt == nil { return false }
        return left.id < right.id
    }
}

private func tripsTodayEntries(
    _ source: TripsTodaySource, clocks: (TripsTodayClock?, TripsTodayClock?),
    state: TripsTodayState, day: String, legID: String? = nil
) -> [TripsTodayCommitment] {
    let (from, to) = clocks
    guard let bounds = tripsTodayBounds(from, to), let from, let to,
        let firstDay = tripsTodayDay(from.at, zone: state.displayZone),
        let lastDay = tripsTodayDay(to.at, zone: state.displayZone)
    else { return [] }
    let identity = source.id + ":" + (legID ?? "source")
    var entries: [TripsTodayCommitment] = []
    if firstDay == day {
        entries.append(
            .init(
                id: identity + ":start", source: source, boundary: .start,
                clock: from, day: day, legID: legID))
    }
    if lastDay == day {
        entries.append(
            .init(
                id: identity + ":end", source: source, boundary: .end,
                clock: to, day: day, legID: legID))
    }
    if firstDay < day && day < lastDay && bounds.lowerBound < bounds.upperBound {
        entries.append(
            .init(
                id: identity + ":continuing", source: source, boundary: .continuing,
                clock: nil, day: day, legID: legID))
    }
    return entries
}

private func tripsTodayEventEntries(
    _ event: TripsTodayEvent, state: TripsTodayState, day: String
) -> [TripsTodayCommitment] {
    if event.start != nil && event.end != nil {
        return tripsTodayEntries(
            .event(event), clocks: (event.start, event.end), state: state, day: day)
    }
    if let start = event.start, tripsTodayClockInstant(start) != nil,
        tripsTodayDay(start.at, zone: state.displayZone) == day
    {
        return [
            .init(
                id: event.id + ":start", source: .event(event), boundary: .start,
                clock: start, day: day)
        ]
    }
    if event.start == nil && event.end == nil && event.day == day && tripsTodayValidDay(day) {
        return [
            .init(
                id: event.id + ":day", source: .event(event), boundary: .continuing,
                clock: nil, day: day)
        ]
    }
    return []
}
