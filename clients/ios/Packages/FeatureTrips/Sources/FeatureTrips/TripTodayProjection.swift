import AppCore
import Foundation

internal struct TripTodayProjection {
    internal let now: [TripSource]
    internal let next: [TripSource]
    internal let other: [TripSource]

    internal init(snapshot: TripSnapshot, at instant: Date) {
        let sources = tripSources(snapshot)
        now = sources.filter { source in
            guard let start = source.start, let end = source.end, start < end else { return false }
            return start <= instant && instant < end
        }.sorted(by: Self.chronology)
        next = sources.filter { $0.isNext(at: instant) }.sorted(by: Self.chronology)
        let classified = Set(now.map(\.id) + next.map(\.id))
        other = sources.filter { source in
            guard !classified.contains(source.id) else { return false }
            if let start = source.start, let end = source.end, start < end, end <= instant {
                return false
            }
            return true
        }
    }

    private static func chronology(_ lhs: TripSource, _ rhs: TripSource) -> Bool {
        guard let left = lhs.start, let right = rhs.start else { return lhs.id < rhs.id }
        return left == right ? lhs.id < rhs.id : left < right
    }
}
