import Foundation
import Testing

@testable import FeaturePairing

/// What a scanned QR code is allowed to mean.
///
/// The rejections matter more than the acceptance. A camera pointed at the
/// world sees Wi-Fi joins, payment links and posters; every one of them that
/// this parser accepted would be a handset trying to pair against a stranger's
/// server.
@Suite("PairingLink.parse")
internal struct PairingLinkTests {
    @Test("the shape bfm actually emits")
    func acceptsTheProducersLink() throws {
        let link = try #require(
            PairingLink.parse("https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND"))

        // The origin, with the contract's path taken back off — that path is
        // the client's to append, not something to carry into every later call.
        #expect(link.baseURL.absoluteString == "https://bfm.example.com")
        // Grouping is preserved: the BFM folds separators itself, and stripping
        // them here would be this app enforcing a producer rule the contract
        // does not state.
        #expect(link.code == "7QK4-9M2X-P3ND")
    }

    @Test(
        "an origin's port, scheme and host survive intact",
        arguments: [
            ("http://localhost:3014/devices/pair?code=ABC", "http://localhost:3014"),
            ("https://bfm.example.com:8443/devices/pair?code=ABC", "https://bfm.example.com:8443"),
            ("HTTPS://BFM.example.com/devices/pair?code=ABC", "https://bfm.example.com"),
            ("https://bfm.example.com/devices/pair/?code=ABC", "https://bfm.example.com"),
            ("http://[::1]:3014/devices/pair?code=ABC", "http://[::1]:3014"),
        ])
    func preservesTheOrigin(payload: String, expected: String) throws {
        let link = try #require(PairingLink.parse(payload))

        #expect(link.baseURL.absoluteString == expected)
    }

    @Test("surrounding whitespace does not make a link unreadable")
    func trimsThePayload() throws {
        let link = try #require(
            PairingLink.parse("  https://bfm.example.com/devices/pair?code=ABC\n"))

        #expect(link.code == "ABC")
    }

    @Test(
        "anything that is not a pairing link is not a pairing link",
        arguments: [
            // Another QR entirely.
            "WIFI:S:HomeNetwork;T:WPA;P:hunter2;;",
            "https://example.com/",
            // Right host, wrong resource — the scanner must not treat any page
            // on the BFM as a pairing offer.
            "https://bfm.example.com/devices?code=ABC",
            "https://bfm.example.com/mobile/bootstrap?code=ABC",
            // A path that merely ends the right way. `new URL('/devices/pair',
            // base)` cannot produce this, so neither can a real link.
            "https://bfm.example.com/evil/devices/pair?code=ABC",
            // No code to spend.
            "https://bfm.example.com/devices/pair",
            "https://bfm.example.com/devices/pair?code=",
            "https://bfm.example.com/devices/pair?code=%20%20",
            // Schemes that are not a BFM.
            "ftp://bfm.example.com/devices/pair?code=ABC",
            "javascript:alert(1)",
            "/devices/pair?code=ABC",
            "",
            "   ",
        ])
    func rejectsEverythingElse(payload: String) {
        #expect(PairingLink.parse(payload) == nil)
    }

    /// A hostile QR is the residual risk of a design where the phone learns its
    /// host by scanning, and this records that the parser does not pretend
    /// otherwise: it checks shape, not trustworthiness. The mitigation is that
    /// the QR is only ever displayed on the operator's own page, behind
    /// Cloudflare Access.
    @Test("a well-formed link to a hostile host still parses, which is the known trade-off")
    func trustsTheOriginItIsGiven() throws {
        let link = try #require(
            PairingLink.parse("https://attacker.example/devices/pair?code=ABC"))

        #expect(link.baseURL.absoluteString == "https://attacker.example")
    }
}
