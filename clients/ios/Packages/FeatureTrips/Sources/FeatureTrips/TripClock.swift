import Foundation

internal enum TripClock {
    internal static func instant(local: String?, zone: String?) -> Date? {
        guard let local, let zone, !zone.hasPrefix("GMT+"), !zone.hasPrefix("GMT-"),
            !zone.hasPrefix("UTC+"), !zone.hasPrefix("UTC-"),
            let timeZone = TimeZone(identifier: zone),
            let parts = components(local)
        else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        guard let naive = utc.date(from: parts) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        // Probe both sides of a source day so folds produce two candidates and gaps produce none.
        let offsets = Set(
            [-86_400.0, 0, 86_400.0].map {
                timeZone.secondsFromGMT(for: naive.addingTimeInterval($0))
            })
        let candidates = offsets.map { naive.addingTimeInterval(-Double($0)) }.filter {
            let components = calendar.dateComponents(
                [.year, .month, .day, .hour, .minute, .second], from: $0)
            return components.year == parts.year && components.month == parts.month
                && components.day == parts.day && components.hour == parts.hour
                && components.minute == parts.minute && components.second == parts.second
        }
        guard candidates.count == 1 else { return nil }
        return candidates.first
    }

    internal static func day(_ value: String) -> Date? {
        let fields = value.split(separator: "-").compactMap { Int($0) }
        guard fields.count == 3, value.count == 10 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        let parts = DateComponents(year: fields[0], month: fields[1], day: fields[2])
        guard let date = calendar.date(from: parts),
            calendar.dateComponents([.year, .month, .day], from: date) == parts
        else { return nil }
        return date
    }

    internal static func dayLabel(_ value: String) -> String {
        guard let date = day(value) else { return value }
        var style = Date.FormatStyle.dateTime.day().month(.abbreviated).year()
        style.timeZone = .gmt
        return date.formatted(style)
    }

    internal static func clockLabel(_ date: Date, zone: TimeZone) -> String {
        var style = Date.FormatStyle.dateTime.hour().minute()
        style.timeZone = zone
        return date.formatted(style)
    }

    internal static func dateLabel(_ date: Date, zone: TimeZone) -> String {
        var style = Date.FormatStyle.dateTime.day().month(.abbreviated).year()
        style.timeZone = zone
        return date.formatted(style)
    }

    private static func components(_ local: String) -> DateComponents? {
        let pieces = local.split(separator: "T")
        guard pieces.count == 2, let date = day(String(pieces[0])) else { return nil }
        let clock = pieces[1].split(separator: ":")
        guard (2...3).contains(clock.count), let hour = Int(clock[0]),
            let minute = Int(clock[1]), (0...23).contains(hour), (0...59).contains(minute)
        else { return nil }
        let seconds = clock.count == 3 ? Double(clock[2]) : 0
        guard let seconds, seconds >= 0, seconds < 60 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        var parts = calendar.dateComponents([.year, .month, .day], from: date)
        parts.hour = hour
        parts.minute = minute
        parts.second = Int(seconds)
        parts.nanosecond = Int((seconds - Double(Int(seconds))) * 1_000_000_000)
        return parts
    }
}
