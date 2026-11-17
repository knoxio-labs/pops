import AppCore
import Foundation

internal struct TripSourceMoment: Equatable {
    internal let day: String?
    internal let clock: String?
    internal let timeZone: String?
    internal let resolutionNote: String?
}

internal func tripSourceMoment(day: String?, clock: String?, timeZone: String?) -> TripSourceMoment {
    let displayDay = day.map(TripClock.dayLabel)
    let displayClock = clock?.trimmingCharacters(in: .whitespacesAndNewlines)
    let zone = timeZone?.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasClock = displayClock?.isEmpty == false
    let hasDay = displayDay?.isEmpty == false

    let resolutionNote: String?
    if hasClock, !hasDay {
        resolutionNote = "Date not supplied"
    } else if hasClock, zone?.isEmpty != false {
        resolutionNote = "Time zone not supplied"
    } else if hasClock, let day, let clock, let zone,
        TripClock.instant(local: "\(day)T\(clock)", zone: zone) == nil
    {
        resolutionNote = "Local time could not be resolved"
    } else {
        resolutionNote = nil
    }

    return TripSourceMoment(
        day: displayDay, clock: hasClock ? displayClock : nil,
        timeZone: zone?.isEmpty == false ? zone : nil, resolutionNote: resolutionNote)
}

internal func tripSourceMoment(for endpoint: TripEndpoint) -> TripSourceMoment {
    if let day = endpoint.date {
        return tripSourceMoment(day: day, clock: nil, timeZone: endpoint.timeZone)
    }
    guard let local = endpoint.local else {
        return tripSourceMoment(day: nil, clock: nil, timeZone: endpoint.timeZone)
    }
    let parts = local.split(separator: "T", maxSplits: 1, omittingEmptySubsequences: false)
    guard parts.count == 2 else {
        return tripSourceMoment(day: local, clock: nil, timeZone: endpoint.timeZone)
    }
    return tripSourceMoment(day: String(parts[0]), clock: String(parts[1]), timeZone: endpoint.timeZone)
}
