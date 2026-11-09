import Foundation

/// Validates a Gregorian date-only source without attaching a source time or time zone.
internal func tripsTodayValidDay(_ value: String) -> Bool {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.isLenient = false
    guard value.count == 10, let date = formatter.date(from: value) else { return false }
    return formatter.string(from: date) == value
}

/// Parses an offset-bearing ISO 8601 instant; invalid calendar dates and floating clocks fail.
internal func tripsTodayInstant(_ value: String) -> Date? {
    let pattern =
        #"^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$"#
    guard value.range(of: pattern, options: .regularExpression) != nil,
        tripsTodayValidDay(String(value.prefix(10)))
    else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}

/// Accepts system IANA identifiers and links, rejecting Foundation's synthetic GMT-offset syntax.
internal func tripsTodayTimeZone(_ identifier: String) -> TimeZone? {
    guard
        identifier == "UTC" || identifier.contains("/")
            || TimeZone.knownTimeZoneIdentifiers.contains(identifier)
    else { return nil }
    return TimeZone(identifier: identifier)
}

/// Validates both the recorded instant and its explicitly recorded source zone.
internal func tripsTodayClockInstant(_ clock: TripsTodayClock?) -> Date? {
    guard let clock, tripsTodayTimeZone(clock.timeZone) != nil else { return nil }
    return tripsTodayInstant(clock.at)
}

/// Returns yyyy-MM-dd in the selected zone, never using the device zone or a fallback zone.
internal func tripsTodayDay(_ at: String, zone: String) -> String? {
    guard let date = tripsTodayInstant(at), let timeZone = tripsTodayTimeZone(zone) else {
        return nil
    }
    return tripsTodayFormatted(date, zone: timeZone, format: "yyyy-MM-dd")
}

/// Returns HH:mm in the requested display zone; invalid source or display clocks return nil.
internal func tripsTodayLocalTime(_ clock: TripsTodayClock, zone: String) -> String? {
    guard let date = tripsTodayClockInstant(clock), let timeZone = tripsTodayTimeZone(zone) else {
        return nil
    }
    return tripsTodayFormatted(date, zone: timeZone, format: "HH:mm")
}

/// Formats a validated date-only value as d MMM yyyy without inventing a source midnight.
internal func tripsTodayDayLabel(_ day: String) -> String? {
    guard tripsTodayValidDay(day), let timeZone = TimeZone(secondsFromGMT: 0) else { return nil }
    let parser = DateFormatter()
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.timeZone = timeZone
    parser.dateFormat = "yyyy-MM-dd"
    guard let date = parser.date(from: day) else { return nil }
    return tripsTodayFormatted(date, zone: timeZone, format: "d MMM yyyy")
}

private func tripsTodayFormatted(_ date: Date, zone: TimeZone, format: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = zone
    formatter.dateFormat = format
    return formatter.string(from: date)
}

/// Returns a valid precise half-open interval; open, reversed and equal bounds remain unresolved.
internal func tripsTodayBounds(_ from: TripsTodayClock?, _ to: TripsTodayClock?) -> Range<Date>? {
    guard let start = tripsTodayClockInstant(from), let end = tripsTodayClockInstant(to),
        start < end
    else {
        return nil
    }
    return start..<end
}

/// Uses source leg order and requires precise valid timing for every segment.
internal func tripsTodayJourneyBounds(_ journey: TripsTodayJourney) -> Range<Date>? {
    guard let first = journey.legs.first, let last = journey.legs.last,
        journey.legs.allSatisfy({ tripsTodayBounds($0.departure, $0.arrival) != nil })
    else { return nil }
    return tripsTodayBounds(first.departure, last.arrival)
}
