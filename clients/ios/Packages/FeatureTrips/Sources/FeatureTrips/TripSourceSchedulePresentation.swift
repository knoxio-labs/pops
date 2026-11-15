import AppCore
import Foundation

internal struct TripSourceSchedulePresentation {
    internal let label: String
    internal let instant: Date?
    internal let recordedClock: String?
    internal let recordedZone: String?
    internal let dates: String

    internal var hasUnresolvedClock: Bool { recordedClock != nil && instant == nil }

    internal init(source: TripSource, isCurrent: Bool) {
        instant = isCurrent ? source.end : source.start
        dates = source.summary
        switch source {
        case .stay(let stay):
            label = isCurrent ? "Checkout" : "Check-in"
            recordedClock = isCurrent ? stay.timing.checkOut : stay.timing.checkIn
            recordedZone = stay.timing.timeZone
        case .event(let event):
            label = isCurrent ? "Ends" : "Starts"
            recordedClock = isCurrent ? event.timing.endTime : event.timing.startTime
            recordedZone = event.timing.timeZone
        case .journey:
            label = isCurrent ? "Arrival" : "Departure"
            recordedClock = nil
            recordedZone = nil
        }
    }
}
