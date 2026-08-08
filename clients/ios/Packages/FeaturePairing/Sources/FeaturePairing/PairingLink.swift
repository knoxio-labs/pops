import Foundation

/// What the operator's Devices page encodes in the pairing QR: where the BFM
/// is, and the code to spend there.
///
/// The two arrive together on purpose. A shipped binary names no host — see
/// `BFMClient.BuiltInBaseURL` — so the origin in this link is how a fresh
/// install learns where to send `POST /devices/pair`, and re-pointing the app
/// at another deployment is a re-pair rather than a rebuild.
public struct PairingLink: Hashable, Sendable {
    /// The BFM's origin, with the contract's path stripped back off.
    public let baseURL: URL
    /// The code exactly as the QR carried it, grouping and all.
    public let code: String

    public init(baseURL: URL, code: String) {
        self.baseURL = baseURL
        self.code = code
    }
}

extension PairingLink {
    /// The path the producer builds the link against. It is a *constant* rather
    /// than "whatever path was in the QR": bfm composes the URL as
    /// `new URL('/devices/pair', publicBaseUrl)`, which discards any path on
    /// the base, so this suffix is the only one a real pairing link can carry.
    /// Requiring it is what stops an unrelated QR code — a Wi-Fi join, a
    /// payment link, a poster — from being read as a pairing attempt.
    internal static let path = "/devices/pair"

    internal static let codeQueryItem = "code"

    /// Reads a scanned payload, or `nil` if it is not a pairing link.
    ///
    /// `nil` means "keep looking", not "show an error". A camera pointed at the
    /// world sees plenty of QR codes, and the scanner stays open until one of
    /// them is this.
    ///
    /// The origin is trusted as far as the person scanning trusts the screen
    /// they scanned it from — a hostile QR pairs the handset against a hostile
    /// server. That is inherent to a design where the phone learns its host by
    /// scanning, and the mitigation is where the QR is displayed (behind
    /// Cloudflare Access, on the operator's own Devices page) rather than
    /// anything this parser can check.
    public static func parse(_ payload: String) -> PairingLink? {
        guard
            let components = URLComponents(
                string: payload.trimmingCharacters(in: .whitespacesAndNewlines)),
            matchesContractPath(components.percentEncodedPath),
            let code = components.queryItems?.first(where: { $0.name == codeQueryItem })?.value,
            !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let baseURL = origin(of: components)
        else { return nil }

        return PairingLink(
            baseURL: baseURL,
            code: code.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    /// A trailing slash is accepted because a proxy or a QR generator may add
    /// one and it addresses the same resource; nothing else is.
    private static func matchesContractPath(_ candidate: String) -> Bool {
        candidate == path || candidate == path + "/"
    }

    /// Scheme, host and port — the path and query are the link's, not the
    /// server's. Built through `URLComponents` rather than by trimming the
    /// string, so a port, an IPv6 literal or percent-encoding in the host all
    /// survive intact.
    ///
    /// The scheme bar matches `BuiltInBaseURL`'s deliberately: `http` is
    /// accepted because a BFM on a home LAN or a Debug build on localhost is
    /// not served over TLS, and rejecting it here would make the local
    /// development path the one that cannot be exercised.
    private static func origin(of components: URLComponents) -> URL? {
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
        // normalising them here is what makes two scans of the same server
        // produce one base URL rather than two that only a byte comparison can
        // tell apart.
        origin.percentEncodedHost = host.lowercased()
        origin.port = components.port
        return origin.url
    }
}
