import Foundation

/// Projects active sources, all known future starts, and the display day's commitments.
/// Both layouts receive the same chronological source set, without a future-window cap.
internal func tripsTodayProjection(_ state: TripsTodayState) -> TripsTodayProjection {
    let day = tripsTodayDay(state.now, zone: state.displayZone)
    let now = tripsTodayInstant(state.now)
    let stays = state.stays.filter { stay in
        guard let now, let bounds = tripsTodayBounds(stay.from, stay.to) else { return false }
        return bounds.contains(now)
    }
    let journeys = state.journeys.compactMap { journey -> (TripsTodayJourney, Date)? in
        guard let now, let start = tripsTodayCandidateStart(journey, now: now) else { return nil }
        return (journey, start)
    }.sorted { left, right in
        if left.1 != right.1 { return left.1 < right.1 }
        return left.0.id < right.0.id
    }
    let next = day == nil ? nil : journeys.first?.0
    let current = day == nil ? [] : stays
    let commitments = day.map { tripsTodayCommitments(state, day: $0) } ?? []
    let catalog = tripsTodayAllSources(state)
    let timed =
        day == nil
        ? []
        : catalog.filter {
            tripsTodaySourcePhase($0, now: state.now) != .other
        }
    let sources = tripsTodayOrderedSources(
        timed + commitments.map(\.source), zone: state.displayZone)
    return .init(
        day: day, currentStays: current, nextJourney: next, commitments: commitments,
        sources: sources, findings: tripsTodayFindings(state, current: current))
}

private func tripsTodayOrderedSources(_ sources: [TripsTodaySource], zone: String)
    -> [TripsTodaySource]
{
    var seen: Set<String> = []
    return sources.filter { seen.insert($0.id).inserted }.sorted { left, right in
        let leftDay = tripsTodaySourceDay(left, zone: zone)
        let rightDay = tripsTodaySourceDay(right, zone: zone)
        if let leftDay, let rightDay, leftDay != rightDay { return leftDay < rightDay }
        let leftAt = tripsTodaySourceStart(left)
        let rightAt = tripsTodaySourceStart(right)
        if let leftAt, let rightAt, leftAt != rightAt { return leftAt < rightAt }
        if leftAt == nil && rightAt != nil { return false }
        if leftAt != nil && rightAt == nil { return true }
        return left.id < right.id
    }
}

private func tripsTodaySourceDay(_ source: TripsTodaySource, zone: String) -> String? {
    switch source {
    case .stay(let stay): stay.from.flatMap { tripsTodayDay($0.at, zone: zone) }
    case .journey(let journey):
        journey.legs.first?.departure.flatMap { tripsTodayDay($0.at, zone: zone) }
    case .event(let event): event.start.flatMap { tripsTodayDay($0.at, zone: zone) } ?? event.day
    }
}

private func tripsTodayCandidateStart(_ journey: TripsTodayJourney, now: Date) -> Date? {
    guard let start = tripsTodayClockInstant(journey.legs.first?.departure) else { return nil }
    if start >= now { return start }
    guard let end = tripsTodayClockInstant(journey.legs.last?.arrival), start < end, now < end
    else {
        return nil
    }
    return start
}
