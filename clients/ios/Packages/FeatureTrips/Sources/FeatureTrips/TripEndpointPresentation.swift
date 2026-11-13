import AppCore
import Foundation

internal struct TripEndpointPresentation: Equatable {
    internal let place: String
    internal let time: String
    internal let day: String?
    internal let zone: String?
    internal let hasUnresolvedClock: Bool

    internal init(endpoint: TripEndpoint, role: String, places: [TripPlace]) {
        place = tripEndpointName(endpoint, places: places) ?? role
        zone = endpoint.timeZone
        if let instant = TripClock.instant(local: endpoint.local, zone: endpoint.timeZone),
            let zone = endpoint.timeZone.flatMap(TimeZone.init(identifier:))
        {
            time = TripClock.clockLabel(instant, zone: zone)
            day = TripClock.dateLabel(instant, zone: zone)
            hasUnresolvedClock = false
        } else if let local = endpoint.local {
            time = local
            day = endpoint.date.map(TripClock.dayLabel)
            hasUnresolvedClock = true
        } else {
            time = "Time not set"
            day = endpoint.date.map(TripClock.dayLabel)
            hasUnresolvedClock = false
        }
    }
}
