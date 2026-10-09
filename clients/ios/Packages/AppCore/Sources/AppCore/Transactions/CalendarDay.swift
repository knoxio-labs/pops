import Foundation

/// A Gregorian calendar day, independent of the time zone used to display it.
public struct CalendarDay: Hashable, Sendable {
    /// The year in the proleptic Gregorian calendar.
    public let year: Int

    /// The month in the proleptic Gregorian calendar, from 1 through 12.
    public let month: Int

    /// The day of the month in the proleptic Gregorian calendar.
    public let day: Int

    private let utcAnchor: Date

    /// The Gregorian calendar day at the Unix epoch.
    public static let unixEpoch = CalendarDay(
        year: 1970,
        month: 1,
        day: 1,
        utcAnchor: Date(timeIntervalSince1970: 0)
    )

    /// Creates a day when the components form a Gregorian calendar date.
    public init?(year: Int, month: Int, day: Int) {
        guard (1...9999).contains(year),
            let utcAnchor = Self.utcGregorianCalendar.date(
                from: DateComponents(year: year, month: month, day: day)
            )
        else { return nil }

        let parsed = Self.utcGregorianCalendar.dateComponents(
            [.year, .month, .day],
            from: utcAnchor
        )
        guard parsed.year == year, parsed.month == month, parsed.day == day else { return nil }

        self.init(year: year, month: month, day: day, utcAnchor: utcAnchor)
    }

    /// Parses exactly `YYYY-MM-DD`, rejecting invalid and noncanonical dates.
    public init?(iso8601: String) {
        let bytes = Array(iso8601.utf8)
        guard bytes.count == 10, bytes[4] == 45, bytes[7] == 45,
            let year = Self.integer(from: bytes[0..<4]),
            let month = Self.integer(from: bytes[5..<7]),
            let day = Self.integer(from: bytes[8..<10])
        else { return nil }

        self.init(year: year, month: month, day: day)
    }

    /// Formats the day for a locale while keeping its Gregorian day fixed in UTC.
    public func formatted(locale: Locale = .autoupdatingCurrent) -> String {
        let style = Date.FormatStyle(
            date: .abbreviated,
            time: .omitted,
            locale: locale,
            calendar: locale.calendar,
            timeZone: .gmt
        )
        return utcAnchor.formatted(style)
    }

    private init(year: Int, month: Int, day: Int, utcAnchor: Date) {
        self.year = year
        self.month = month
        self.day = day
        self.utcAnchor = utcAnchor
    }

    private static func integer(from bytes: ArraySlice<UInt8>) -> Int? {
        guard !bytes.isEmpty, bytes.allSatisfy({ (48...57).contains($0) }) else { return nil }
        return bytes.reduce(0) { $0 * 10 + Int($1 - 48) }
    }

    private static let utcGregorianCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        return calendar
    }()
}
