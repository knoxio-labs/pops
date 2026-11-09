import Foundation

/// RFC 9110 sections 5.6.7 and 10.2.3, matching the SDK's retry-after parser.
internal enum BFMRetryAfter {
    internal static func seconds(_ raw: String?, now: Date = .now) -> Int? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty
        else { return nil }
        if value.range(of: #"^[0-9]+$"#, options: .regularExpression) != nil { return Int(value) }
        for (pattern, format) in formats
        where value.range(of: pattern, options: .regularExpression) != nil {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = .gmt
            formatter.isLenient = false
            formatter.dateFormat = format
            formatter.twoDigitStartDate = formatter.calendar.date(
                byAdding: .year, value: -50, to: now)
            guard let date = formatter.date(from: value) else { continue }
            let delay = max(0, date.timeIntervalSince(now).rounded())
            guard delay.isFinite, delay < Double(Int.max) else { return nil }
            return Int(delay)
        }
        return nil
    }

    private static let formats: [(String, String)] = [
        (
            #"^[A-Z][a-z]{2}, [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$"#,
            "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
        ),
        (
            #"^[A-Z][a-z]+, [0-9]{2}-[A-Z][a-z]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$"#,
            "EEEE, dd-MMM-yy HH:mm:ss 'GMT'"
        ),
        (
            #"^[A-Z][a-z]{2} [A-Z][a-z]{2} (?: [0-9]|[0-9]{2}) [0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{4}$"#,
            "EEE MMM d HH:mm:ss yyyy"
        ),
    ]
}
