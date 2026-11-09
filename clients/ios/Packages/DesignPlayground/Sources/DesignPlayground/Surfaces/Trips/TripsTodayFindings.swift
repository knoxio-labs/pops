/// Reports invalid and unresolved source timing even when it cannot appear in the day projection.
internal func tripsTodayFindings(
    _ state: TripsTodayState, current: [TripsTodayStay]
) -> [TripsTodayFinding] {
    var findings: [TripsTodayFinding] = []
    if tripsTodayInstant(state.now) == nil {
        findings.append(
            .init(id: "now", message: "The reference instant is invalid.", sourceIDs: []))
    }
    if tripsTodayTimeZone(state.displayZone) == nil {
        findings.append(
            .init(id: "zone", message: "The display time zone is invalid.", sourceIDs: []))
    }
    for stay in state.stays where tripsTodayBounds(stay.from, stay.to) == nil {
        findings.append(timingFinding(stay.id, name: stay.name))
    }
    for journey in state.journeys {
        if tripsTodayJourneyBounds(journey) == nil {
            findings.append(timingFinding(journey.id, name: journey.name))
        } else if tripsTodayLegsOverlap(journey) {
            findings.append(
                .init(
                    id: journey.id + ":legs", message: "Journey legs overlap.",
                    sourceIDs: [journey.id]))
        }
    }
    findings += state.events.compactMap(tripsTodayEventFinding)
    if current.count > 1 {
        findings.append(
            .init(
                id: "stay-overlap", message: "Current accommodation sources overlap.",
                sourceIDs: current.map(\.id)))
    }
    return findings + tripsTodayLodgingFindings(state)
}

private func timingFinding(_ id: String, name: String) -> TripsTodayFinding {
    .init(
        id: id + ":timing", message: "\(name): precise timing is unavailable or invalid.",
        sourceIDs: [id])
}

private func tripsTodayLegsOverlap(_ journey: TripsTodayJourney) -> Bool {
    zip(journey.legs, journey.legs.dropFirst()).contains { previous, next in
        guard let arrival = tripsTodayClockInstant(previous.arrival),
            let departure = tripsTodayClockInstant(next.departure)
        else { return false }
        return arrival > departure
    }
}

private func tripsTodayEventFinding(_ event: TripsTodayEvent) -> TripsTodayFinding? {
    if let day = event.day, !tripsTodayValidDay(day) {
        return timingFinding(event.id, name: event.name)
    }
    if event.start == nil && event.end == nil {
        return event.day == nil ? timingFinding(event.id, name: event.name) : nil
    }
    guard tripsTodayClockInstant(event.start) != nil else {
        return timingFinding(event.id, name: event.name)
    }
    if event.end != nil && tripsTodayBounds(event.start, event.end) == nil {
        return timingFinding(event.id, name: event.name)
    }
    return nil
}

private func tripsTodayLodgingFindings(_ state: TripsTodayState) -> [TripsTodayFinding] {
    state.lodgingWindows.compactMap { window in
        guard let required = tripsTodayBounds(window.from, window.to) else {
            return .init(
                id: window.id + ":timing",
                message: "\(window.name): accommodation bounds are unknown or invalid.",
                sourceIDs: [])
        }
        let intervals = state.stays.compactMap { tripsTodayBounds($0.from, $0.to) }
            .sorted { $0.lowerBound < $1.lowerBound }
        var coveredUntil = required.lowerBound
        for interval in intervals where interval.upperBound > coveredUntil {
            if interval.lowerBound > coveredUntil { break }
            coveredUntil = max(coveredUntil, interval.upperBound)
        }
        guard coveredUntil < required.upperBound else { return nil }
        return .init(
            id: window.id + ":gap",
            message: "\(window.name): declared accommodation window is not covered.",
            sourceIDs: state.stays.filter {
                tripsTodayBounds($0.from, $0.to)?.overlaps(required) == true
            }.map(\.id))
    }
}
