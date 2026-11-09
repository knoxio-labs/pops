import Foundation

internal enum TripBookingScope: String, CaseIterable, Identifiable {
    case all = "All"
    case currentAndFuture = "Now and Next"
    case past = "Past"

    internal var id: Self { self }

    internal func includes(_ source: TripSource, at now: Date) -> Bool {
        guard self != .all else { return true }
        if let start = source.start, let end = source.end, start >= end { return false }
        switch self {
        case .all: return true
        case .currentAndFuture:
            guard let start = source.start else { return false }
            if start > now { return true }
            guard let end = source.end else { return false }
            return start < end && end > now
        case .past:
            guard let end = source.end else { return false }
            return end <= now
        }
    }
}
