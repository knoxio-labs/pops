import Foundation
import OpenAPIRuntime

/// The two spellings of an ISO-8601 instant this client accepts, in one place.
///
/// Both are legitimate ISO-8601 and which one arrives is the producer's
/// serialiser's choice rather than a contract term: JavaScript's
/// `toISOString()` — what every TypeScript pillar in this federation uses —
/// emits milliseconds, and most other emitters do not. The BFM's own contract
/// says so explicitly: the `date-time` pattern it publishes makes the fractional
/// part optional.
internal enum ISO8601Instant {
    /// Millisecond precision on the way out, which the contract's pattern
    /// permits and which round-trips anything this app parsed.
    private static let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let whole = Date.ISO8601FormatStyle()

    internal static func parse(_ raw: String) -> Date? {
        if let parsed = try? Date(raw, strategy: withFraction) { return parsed }
        return try? Date(raw, strategy: whole)
    }

    internal static func string(from date: Date) -> String {
        date.formatted(withFraction)
    }
}

/// What the generated client uses to read a `format: date-time` field.
///
/// Without it the runtime's default transcoder applies `withInternetDateTime`
/// alone, which rejects a fractional part outright — so `GET /mobile/bootstrap`
/// failed to decode against a real BFM, every time, because `device.lastSeenAt`
/// is a `Date().toISOString()`. The app answered that by falling back to the
/// features it was compiled with and drawing "Some of Pops could not be
/// reached" over them, on a federation that was entirely healthy.
///
/// Nothing caught it below this layer: the suites here spell their fixtures
/// without milliseconds, so the fake and the producer disagreed and only a run
/// against the real pillar could tell (POPS-1698).
internal struct BFMDateTranscoder: DateTranscoder {
    internal func encode(_ date: Date) throws -> String {
        ISO8601Instant.string(from: date)
    }

    internal func decode(_ string: String) throws -> Date {
        guard let parsed = ISO8601Instant.parse(string) else {
            throw BFMDateDecodingError(raw: string)
        }
        return parsed
    }
}

/// A `date-time` field carrying something that is not an ISO-8601 instant.
///
/// Its own type rather than a `DecodingError`, so the message names the value
/// the server actually sent — which is the only thing a reader of this failure
/// can act on.
internal struct BFMDateDecodingError: Error, CustomStringConvertible {
    internal let raw: String

    internal var description: String {
        "expected an ISO-8601 instant, got \"\(raw)\""
    }
}
