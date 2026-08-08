import Foundation
import Testing

@testable import FeaturePairing

@Suite("PairingField")
internal struct PairingFieldTests {
    @Test("a value is trimmed, and whitespace alone is nothing")
    func trimming() {
        #expect(PairingField.trimmed("  7QK4 \n") == "7QK4")
        #expect(PairingField.trimmed("") == nil)
        #expect(PairingField.trimmed("   \t\n ") == nil)
    }

    @Test("the bound is inclusive at the limit and exclusive past it")
    func bounds() {
        let limit = PairingField.maximumLength
        #expect(PairingField.withinBounds(String(repeating: "A", count: limit)))
        #expect(!PairingField.withinBounds(String(repeating: "A", count: limit + 1)))
    }

    /// The measurement that has to match the *server's*, not the one Swift
    /// makes convenient. An emoji is one `Character` and two UTF-16 units, and
    /// the BFM counts the latter — so 33 of them is over a bound of 64 even
    /// though `String.count` says 33.
    @Test("the bound counts UTF-16 code units, as the BFM does")
    func boundsCountUTF16() {
        let limit = PairingField.maximumLength
        #expect(PairingField.withinBounds(String(repeating: "👍", count: limit / 2)))
        #expect(!PairingField.withinBounds(String(repeating: "👍", count: limit / 2 + 1)))
    }

    @Test("a hardware value too long to send is cut rather than refused")
    func clamping() {
        let long = String(repeating: "M", count: PairingField.maximumLength * 2)

        #expect(PairingField.clamped(long).utf16.count == PairingField.maximumLength)
        #expect(PairingField.clamped("iPhone17,1") == "iPhone17,1")
    }

    /// Cutting at an odd UTF-16 offset through a surrogate pair produces a
    /// string that cannot be encoded as JSON. The clamp stops one unit short
    /// instead, which is why the result here is 63 rather than 64.
    @Test("clamping never splits a surrogate pair")
    func clampingStopsOnACharacterBoundary() {
        let limit = PairingField.maximumLength
        let value = String(repeating: "A", count: limit - 1) + String(repeating: "👍", count: 4)

        let clamped = PairingField.clamped(value)

        #expect(clamped.utf16.count == limit - 1)
        #expect(clamped == String(repeating: "A", count: limit - 1))
        #expect(clamped.data(using: .utf8) != nil)
    }

    @Test(
        "a usable server address",
        arguments: [
            "https://bfm.example.com",
            "http://localhost:3014",
            "  https://bfm.example.com  ",
            "https://bfm.example.com/",
        ])
    func acceptsUsableAddresses(raw: String) {
        #expect(PairingField.baseURL(raw) != nil)
    }

    /// The bar is higher than `URL(string:)` on purpose: that initialiser
    /// accepts a bare host as a *path*, so a half-typed address would sail
    /// through here and fail much later as an unreachable server.
    @Test(
        "and everything that would fail later instead of now",
        arguments: [
            "bfm.example.com",
            "/devices/pair",
            "ftp://bfm.example.com",
            "https://",
            "",
            "   ",
        ])
    func rejectsAddressesThatWouldFailLater(raw: String) {
        #expect(PairingField.baseURL(raw) == nil)
    }
}

/// The one number in this package that also lives somewhere else.
///
/// `maxLength` is in the vendored OpenAPI snapshot but the generated Swift
/// client does not enforce it, so the form has to — and a hand-copied bound is
/// a bound that drifts. This reads the snapshot the client is generated from
/// and fails if the two ever disagree, which turns a silent 400 on a real
/// device into a red test here.
@Suite("Pairing field bounds match the contract")
internal struct PairingFieldBoundsTests {
    /// `.../Packages/FeaturePairing/Tests/FeaturePairingTests/<this file>`
    private static var vendoredContract: URL {
        URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Contracts/bfm.openapi.json")
    }

    @Test("every string field of POST /devices/pair is bounded at PairingField.maximumLength")
    func boundMatchesTheSnapshot() throws {
        let data = try Data(contentsOf: Self.vendoredContract)
        let root = try #require(
            try JSONSerialization.jsonObject(with: data) as? [String: Any],
            "\(Self.vendoredContract.path) is not a JSON object — has the client moved?")

        let properties = try #require(
            Self.requestProperties(in: root),
            "POST /devices/pair has no JSON request body in the vendored contract")

        // The three fields the form fills, named rather than "every property":
        // `publicKey` is bounded at 512 and is not the form's to type, so a
        // loop over everything would assert one number against two.
        for field in ["code", "deviceName", "deviceModel"] {
            let schema = try #require(properties[field] as? [String: Any], "no `\(field)` property")
            let declared = schema["maxLength"] as? Int
            #expect(
                declared == PairingField.maximumLength,
                """
                `\(field)` is bounded at \(declared.map(String.init) ?? "nothing") in the \
                contract, but PairingField.maximumLength is \(PairingField.maximumLength)
                """
            )
        }
    }

    private static func requestProperties(in root: [String: Any]) -> [String: Any]? {
        guard let paths = root["paths"] as? [String: Any],
            let pair = paths["/devices/pair"] as? [String: Any],
            let post = pair["post"] as? [String: Any],
            let body = post["requestBody"] as? [String: Any],
            let content = body["content"] as? [String: Any],
            let json = content["application/json"] as? [String: Any],
            let schema = json["schema"] as? [String: Any]
        else { return nil }

        return schema["properties"] as? [String: Any]
    }
}
