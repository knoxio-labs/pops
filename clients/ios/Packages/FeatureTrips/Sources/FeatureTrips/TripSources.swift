import AppCore
import Foundation

internal enum TripSource: Hashable, Identifiable {
    case stay(TripStay)
    case journey(TripJourney)
    case event(TripEvent)

    internal var id: String {
        switch self {
        case .stay(let stay): "stay-\(stay.id)"
        case .journey(let journey): "journey-\(journey.id)"
        case .event(let event): "event-\(event.id)"
        }
    }

    internal var name: String {
        switch self {
        case .stay(let stay): stay.name ?? "Stay \(stay.id)"
        case .journey(let journey): journey.name ?? "Journey \(journey.id)"
        case .event(let event): event.name ?? "Event \(event.id)"
        }
    }

    internal var symbol: String {
        switch self {
        case .stay: "bed.double"
        case .journey: "arrow.triangle.swap"
        case .event: "calendar"
        }
    }

    internal var start: Date? {
        switch self {
        case .stay(let stay):
            Self.stayInstant(stay.timing.arrival, stay.timing.checkIn, stay.timing.timeZone)
        case .event(let event):
            Self.stayInstant(event.timing.start, event.timing.startTime, event.timing.timeZone)
        case .journey(let journey):
            TripClock.instant(
                local: journey.legs.first?.from.local, zone: journey.legs.first?.from.timeZone)
        }
    }

    internal var end: Date? {
        switch self {
        case .stay(let stay):
            Self.stayInstant(stay.timing.departure, stay.timing.checkOut, stay.timing.timeZone)
        case .event(let event):
            Self.stayInstant(event.timing.end, event.timing.endTime, event.timing.timeZone)
        case .journey(let journey):
            TripClock.instant(
                local: journey.legs.last?.to.local, zone: journey.legs.last?.to.timeZone)
        }
    }

    internal var days: [String] {
        switch self {
        case .stay(let stay): [stay.timing.arrival, stay.timing.departure].compactMap { $0 }
        case .event(let event): [event.timing.start, event.timing.end].compactMap { $0 }
        case .journey(let journey):
            journey.legs.flatMap { [$0.from.local, $0.to.local] }
                .compactMap { $0.map { String($0.prefix(10)) } }
        }
    }

    internal var status: String? {
        if case .stay(let stay) = self { return stay.status }
        if case .event(let event) = self { return event.purchase }
        return nil
    }

    internal var summary: String {
        switch self {
        case .stay(let stay):
            [stay.timing.arrival, stay.timing.departure].compactMap { $0 }
                .map(TripClock.dayLabel).joined(separator: " – ")
        case .event(let event):
            [event.timing.start, event.timing.end].compactMap { $0 }
                .map(TripClock.dayLabel).joined(separator: " – ")
        case .journey(let journey):
            journey.legs.flatMap { [$0.from.sourceLabel, $0.to.sourceLabel] }
                .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " → ")
        }
    }

    private static func stayInstant(_ day: String?, _ clock: String?, _ zone: String?) -> Date? {
        guard let day, let clock else { return nil }
        return TripClock.instant(local: "\(day)T\(clock)", zone: zone)
    }
}

internal func tripSources(_ snapshot: TripSnapshot) -> [TripSource] {
    allTripSources(snapshot).filter { !$0.isAlternative(in: snapshot) }
}

internal func allTripSources(_ snapshot: TripSnapshot) -> [TripSource] {
    snapshot.stays.map(TripSource.stay) + snapshot.journeys.map(TripSource.journey)
        + snapshot.events.map(TripSource.event)
}

extension TripSource {
    internal func isNext(at instant: Date) -> Bool {
        guard let start else { return false }
        return start > instant
    }

    internal func isAlternative(in snapshot: TripSnapshot) -> Bool {
        guard case .journey(let journey) = self else { return false }
        let selected = Set(snapshot.journeyGroups.map(\.currentJourneyId))
        let alternatives = Set(snapshot.journeyGroups.flatMap(\.alternativeJourneyIds)).subtracting(
            selected)
        return alternatives.contains(journey.id)
    }
}
