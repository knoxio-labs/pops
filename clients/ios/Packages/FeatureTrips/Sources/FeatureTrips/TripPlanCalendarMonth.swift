import Foundation

internal struct TripPlanCalendarMonth: Equatable {
    internal let firstDay: String
    internal let days: [String]

    internal init?(containing day: String) {
        guard let date = TripClock.day(day) else { return nil }
        let calendar = Self.calendar
        guard let range = calendar.range(of: .day, in: .month, for: date) else { return nil }
        let prefix = String(day.prefix(7))
        firstDay = "\(prefix)-01"
        days = range.map { String(format: "%@-%02d", prefix, $0) }
    }

    internal func cells(firstWeekday: Int) -> [String?] {
        guard let date = TripClock.day(firstDay), (1...7).contains(firstWeekday) else { return [] }
        let leading = (Self.calendar.component(.weekday, from: date) - firstWeekday + 7) % 7
        let occupied = leading + days.count
        let trailing = (7 - occupied % 7) % 7
        return Array(repeating: nil, count: leading) + days.map(Optional.some)
            + Array(repeating: nil, count: trailing)
    }

    internal func moved(by months: Int) -> TripPlanCalendarMonth? {
        guard let date = TripClock.day(firstDay),
            let moved = Self.calendar.date(byAdding: .month, value: months, to: date)
        else { return nil }
        let key = Self.dayKey(moved, zone: .gmt)
        return TripPlanCalendarMonth(containing: key)
    }

    internal static func dayKey(_ date: Date, zone: TimeZone) -> String {
        var calendar = Self.calendar
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        return calendar
    }
}
