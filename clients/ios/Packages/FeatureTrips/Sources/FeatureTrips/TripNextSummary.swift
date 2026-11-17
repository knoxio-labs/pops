import AppCore
import Foundation

internal struct TripNextSummary {
    internal let title: String
    internal let timing: [String]
    internal let states: [String]
    internal let stateScope: String?
    internal let hasConflictingTimes: Bool

    internal init(source: TripSource, places: [TripPlace], zone: TimeZone) {
        title = source.displayName(places: places)
        hasConflictingTimes =
            source.start.flatMap { start in
                source.end.map { start >= $0 }
            } ?? false
        timing = tripNextTiming(source, places: places, zone: zone)
        switch source {
        case .stay(let stay):
            states = [stay.status].compactMap { $0 }.filter { !$0.isEmpty }
            stateScope = nil
        case .event(let event):
            states = [event.intention, event.arrangement, event.purchase]
                .compactMap { $0 }.filter { !$0.isEmpty }
            stateScope = nil
        case .journey(let journey):
            let departure = journey.legs.first
            states = [departure?.intention, departure?.arrangement, departure?.purchase]
                .compactMap { $0 }.filter { !$0.isEmpty }
            stateScope = journey.legs.count > 1 ? "Departure" : nil
        }
    }

    internal var when: String { timing.joined(separator: " · ") }

    internal var stateLine: String? {
        guard !states.isEmpty else { return nil }
        return ([stateScope].compactMap { $0 } + states).joined(separator: " · ")
    }
}

private func tripNextTiming(_ source: TripSource, places: [TripPlace], zone: TimeZone) -> [String] {
    if let start = source.start {
        return [
            TripClock.dateLabel(start, zone: zone), TripClock.clockLabel(start, zone: zone),
            zone.identifier,
        ]
    }
    if case .journey(let journey) = source {
        guard let endpoint = journey.legs.first?.from else { return ["Time not set"] }
        let value = TripEndpointPresentation(endpoint: endpoint, role: "Departure", places: places)
        return [
            value.day, value.time, value.zone,
            value.hasUnresolvedClock ? "Time cannot be resolved" : nil,
        ]
        .compactMap { $0 }
    }
    let value = TripSourceSchedulePresentation(source: source, isCurrent: false)
    return [
        value.dates.isEmpty ? nil : value.dates, value.recordedClock ?? "Time not set",
        value.recordedZone, value.hasUnresolvedClock ? "Time cannot be resolved" : nil,
    ]
    .compactMap { $0 }
}
