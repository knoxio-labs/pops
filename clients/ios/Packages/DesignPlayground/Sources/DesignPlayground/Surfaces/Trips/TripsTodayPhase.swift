import Foundation

/// Explicit temporal classification; date-only, unresolved and past sources remain other.
internal enum TripsTodaySourcePhase: String, Sendable {
    case now, next, other
}

/// Classifies source clocks against an explicit instant, independently of purchase or agreement.
/// Now requires valid half-open bounds; Next requires a strictly future known start, even with no end.
internal func tripsTodaySourcePhase(
    _ source: TripsTodaySource, now: String
) -> TripsTodaySourcePhase {
    guard let instant = tripsTodayInstant(now) else { return .other }
    let clocks = tripsTodaySourceClocks(source)
    if let bounds = tripsTodayBounds(clocks.start, clocks.end), bounds.contains(instant) {
        return .now
    }
    if let start = tripsTodayClockInstant(clocks.start), start > instant { return .next }
    return .other
}

/// Reads the exact source start; journey timing uses only the first recorded leg's departure.
internal func tripsTodaySourceStart(_ source: TripsTodaySource) -> Date? {
    tripsTodayClockInstant(tripsTodaySourceClocks(source).start)
}

private func tripsTodaySourceClocks(
    _ source: TripsTodaySource
) -> (start: TripsTodayClock?, end: TripsTodayClock?) {
    switch source {
    case .stay(let stay): (stay.from, stay.to)
    case .journey(let journey): (journey.legs.first?.departure, journey.legs.last?.arrival)
    case .event(let event): (event.start, event.end)
    }
}
