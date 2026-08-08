import Foundation

/// The bounds the pairing form holds its inputs to, and where they come from.
///
/// What is *not* here is as deliberate as what is. The pairing code's alphabet,
/// its length and its grouping are the BFM's rules and appear nowhere in the
/// OpenAPI contract, so restating them would be a second copy that nothing
/// gates — a producer that widened its alphabet would find this app rejecting
/// codes the server would have accepted, and the only symptom would be a
/// disabled button. The code is therefore passed through as typed and the
/// server decides; a code that could never have been issued comes back as an
/// ordinary rejection, which is exactly what it is.
///
/// The one bound that *is* enforced is the contract's own, because the
/// generated client does not enforce it and an over-long field comes back as a
/// 400 the user would read as a broken app. ``PairingFieldBoundsTests`` asserts
/// the number below still matches the vendored snapshot.
internal enum PairingField {
    /// `maxLength` on `code`, `deviceName` and `deviceModel` in
    /// `POST /devices/pair`.
    internal static let maximumLength = 64

    /// The field's value with surrounding whitespace removed, or `nil` when
    /// nothing is left. Trimming is safe for the code as well as the name: the
    /// BFM strips whitespace before matching, so it cannot change the outcome.
    internal static func trimmed(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Measured in UTF-16 code units, which is neither what Swift's `count`
    /// reports nor what the contract literally says — and is the only one of
    /// the three that cannot produce a rejection.
    ///
    /// JSON Schema defines `maxLength` over Unicode code points. The BFM
    /// enforces it with Zod's `.max(64)`, which is JavaScript's
    /// `String.length`: UTF-16 code units, so an emoji counts twice. Swift's
    /// `String.count` is grapheme clusters, looser than both. Taking the
    /// strictest of the three means a name this form accepts is one the server
    /// accepts; taking either other reading would let a 400 through as
    /// "this app sent something the server refused", which is unactionable.
    internal static func withinBounds(_ value: String) -> Bool {
        value.utf16.count <= maximumLength
    }

    /// For values that come from the hardware rather than from a person, where
    /// refusing is not a recovery anyone can act on.
    ///
    /// Cut on a character boundary while counting UTF-16 units, so the result
    /// is never a lone surrogate — `prefix(_:)` on the UTF-16 view can split a
    /// pair and produce a string that will not round-trip through JSON.
    internal static func clamped(_ value: String) -> String {
        guard !withinBounds(value) else { return value }

        var clamped = ""
        for character in value {
            guard clamped.utf16.count + character.utf16.count <= maximumLength else { break }
            clamped.append(character)
        }
        return clamped
    }

    /// The server field, held to the same bar as `BuiltInBaseURL`: an absolute
    /// HTTP(S) URL with a host.
    ///
    /// Higher than `URL(string:)`, which accepts a bare path and would turn a
    /// half-typed `bfm.example.com` into a relative URL that fails much later,
    /// at the request, as an unreachable server.
    internal static func baseURL(_ raw: String) -> URL? {
        guard let trimmed = trimmed(raw),
            let components = URLComponents(string: trimmed),
            let scheme = components.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            let host = components.host,
            !host.isEmpty,
            let url = components.url
        else { return nil }

        return url
    }
}
