import Foundation

/// Reducing whatever names a BFM — a scanned link, a typed address — to the one
/// form the rest of the app uses: scheme, host, port, nothing else.
///
/// One place rather than two because the two callers must not disagree.
/// Scanning a QR and pasting the same URL into the server field have to produce
/// the same base URL, or `PairedDevice.baseURL` depends on how the person got
/// there.
internal enum ServerOrigin {
    /// - Returns: The origin, or `nil` if this is not an absolute HTTP(S) URL
    ///   with a host.
    ///
    /// `http` is accepted alongside `https`, matching `BuiltInBaseURL`: a BFM on
    /// a home LAN or a Debug build on localhost is not served over TLS, and
    /// rejecting it would make the local path the one that cannot be exercised.
    internal static func of(_ components: URLComponents) -> URL? {
        // `percentEncodedHost` on both sides of the round trip, not `host`: the
        // decoded accessor hands back an IPv6 literal without its brackets, and
        // writing that back produces a URL that will not parse.
        guard let scheme = components.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            let host = components.percentEncodedHost,
            !host.isEmpty
        else { return nil }

        var origin = URLComponents()
        origin.scheme = scheme
        // Scheme and host are both case-insensitive per RFC 3986 §3.2.2, and
        // normalising them is what makes two routes to the same server produce
        // one base URL rather than two that only a byte comparison tells apart.
        origin.percentEncodedHost = host.lowercased()
        origin.port = components.port
        return origin.url
    }
}
